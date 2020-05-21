import * as babelTypes from '@babel/types';
import generate, { GeneratorOptions } from '@babel/generator';
import { parse, ParserOptions } from '@babel/parser';
import traverse from '@babel/traverse';
import flatten from 'lodash/flatten';
import orderBy from 'lodash/orderBy';
import sortBy from 'lodash/sortBy';
import uniq from 'lodash/uniq';

const parseOptions: ParserOptions = {
	sourceType: 'module',
	strictMode: false,
	plugins: ['typescript', 'classPrivateProperties', 'classProperties']
};

const babelGeneratorOptions: GeneratorOptions = {
	comments: true
};

const angularJsTypes: Record<string, string> = {
	$document: 'IDocumentService',
	$http: 'IHttpService',
	$interval: 'IIntervalService',
	$location: 'ILocationService',
	$rootScope: 'IRootScope',
	$scope: 'IScope',
	$timeout: 'ITimeoutService',
	$window: 'IWindowService'
};

export interface FunctionToClassConverterOptions {
	annotateTypes?: boolean;
	angularJs?: boolean;
};

const defaultOptions: FunctionToClassConverterOptions = {
	annotateTypes: false,
	angularJs: false
};

class FunctionToClassConverter {
	properties: babelTypes.ClassProperty[] = [];
	methods: babelTypes.ClassMethod[] = [];
	idMap: Record<string, babelTypes.Node> = {};
	copiedComments: number[] = [];
	contextAlias?: string;

	// @ts-ignore this.ctor is constructed in convertFunctionToClass
	ctor: babelTypes.ClassMethod;

	private constructor(
		private readonly options: FunctionToClassConverterOptions = defaultOptions
	) {
		// Cannot be publicly constructed
	}

	static convertFunctionToClass(source: string, options?: FunctionToClassConverterOptions): string {
		if (!source?.trim()) throw Error('Source is empty');
		if (source.trim().indexOf('function') === -1) throw Error('Source is not a function');

		const ast = parse(source, parseOptions);
		if (ast.program.body.length === 0) throw Error('Source is empty');

		const converter = new FunctionToClassConverter(options);
		const stmts = converter.convertFunctionToClass(ast.program.body);

		let output: string;
		try {
			output = stmts.map(stmt => generate(stmt, babelGeneratorOptions).code).join('\n\n');
		} catch {
			throw Error('Failed to convert function to class');
		}

		try {
			// babel generator doesn't allow formatting options. No need to use prettier just for indentation.
			output = FunctionToClassConverter.indentLikeSource(source, output);
		} catch {
			// Ignore error when indenting since it won't change the functionality
		}

		return output;
	}

	private static indentLikeSource(source: string, output: string): string {
		const sourceIndentation = this.detectIndentation(source);
		const outputIndentation = this.detectIndentation(output);

		if (sourceIndentation && outputIndentation && sourceIndentation !== outputIndentation) {
			const indentationRegex = new RegExp(`\n(${outputIndentation})+`, 'g');
			output = output.replace(indentationRegex, match => {
				const levels = match.substr(1).length / outputIndentation.length;
				return '\n' + ''.padStart(levels * sourceIndentation.length, sourceIndentation);
			});
		}

		if (output.substr(output.length - 3, 2) === '\n\n') {
			output = output.substr(0, output.length - 2) + output[output.length - 1];
		}

		return output;
	}

	private static detectIndentation(source: string): string {
		if (!source) return '';
		if (source.includes('\n\t')) return '\t';

		const matches = uniq(source.match(/\n +(?!\*)/g)?.map(m => m.substr(1)) || []);
		if (matches.length === 0) return '';
		if (matches.length === 1) return matches[0];

		const sorted = orderBy(matches, m => m.length, 'desc');
		const len = sorted[0].length - sorted[1].length;
		return ''.padStart(len, ' ');
	}

	getLastStatement(block: babelTypes.BlockStatement): babelTypes.Statement | undefined {
		for (let index = block.body.length - 1; index >= 0; index--) {
			const node = block.body[index];
			if (babelTypes.isStatement(node) && !babelTypes.isFunctionDeclaration(node)) {
				return node;
			}
		}
	}

	convertFunctionToClass(stmts: babelTypes.Statement[]): babelTypes.Statement[] {
		const func = stmts[0];
		if (!babelTypes.isFunctionDeclaration(func)) throw Error('Source is not a function');

		const lastStmtInsideFunc = this.getLastStatement(func.body);

		if (babelTypes.isReturnStatement(lastStmtInsideFunc)) {
			if (babelTypes.isIdentifier(lastStmtInsideFunc.argument)) {
				this.contextAlias = lastStmtInsideFunc.argument.name;
			} else if (!babelTypes.isObjectExpression(lastStmtInsideFunc.argument)) {
				throw Error('Function has a return statement but does not appear to be a factory function.');
			}
		} else {
			this.contextAlias = this.getContextAlias(func);
		}

		this.ctor = this.createClassConstructor(func);

		for (let index = 0; index < func.body.body.length; index++) {
			const stmt = func.body.body[index];
			if (babelTypes.isVariableDeclaration(stmt)) {
				this.handleVariableDeclaration(stmt);
			} else if (babelTypes.isFunctionDeclaration(stmt)) {
				this.handleFunctionDeclaration(stmt);
			} else if (babelTypes.isExpressionStatement(stmt)) {
				this.handleExpressionStatement(stmt);
			} else if (stmt === lastStmtInsideFunc && babelTypes.isReturnStatement(stmt) && babelTypes.isObjectExpression(stmt.argument)) {
				for (const prop of stmt.argument.properties) {
					this.handleObjectProperty(prop);
				}
			} else if (stmt !== lastStmtInsideFunc) {
				this.ctor.body.body.push(stmt);
			}
		}

		const newStmts: babelTypes.Statement[] = [];
		for (let index = 1; index < stmts.length; index++) {
			const stmt = stmts[index];
			if (babelTypes.isExpressionStatement(stmt)) {
				if (this.handleAssignmentExpressionStatement(stmt, func.id?.name)) continue;
			}
			newStmts.push(stmt);
		}

		this.properties = sortBy(this.properties, p => (p.key as babelTypes.Identifier).name);
		this.methods = sortBy(this.methods, m => (m.key as babelTypes.Identifier).name);

		if (this.ctor.body.body.length > 0 || this.ctor.params.length > 0) {
			this.methods.unshift(this.ctor);
		}

		const convertedIds = this.convertIdentifiersToMemberExpressions();
		this.removePrivateKeywordFromUnusedConstructorParams(convertedIds);
		this.convertFunctionExpressionsToArrowFunctionExpressions();
		this.removeRedundantObjectProperty();

		const body = babelTypes.classBody([...this.properties, ...this.methods]);
		const classDeclaration = babelTypes.classDeclaration(func.id, null, body, null);

		newStmts.push(classDeclaration);
		return newStmts;
	}

	isNamedIdentifier(node: babelTypes.Node, name: string): node is babelTypes.Identifier {
		if (babelTypes.isTSParameterProperty(node)) return this.isNamedIdentifier(node.parameter, name);
		return babelTypes.isIdentifier(node) && node.name === name;
	}

	isNamedMemberExpr(memberExpr: babelTypes.Expression, objName: string, propName: string): memberExpr is babelTypes.MemberExpression {
		if (!babelTypes.isMemberExpression(memberExpr)) return false;
		return this.isNamedIdentifier(memberExpr.object, objName) && this.isNamedIdentifier(memberExpr.property, propName);
	}

	getContextAlias(func: babelTypes.FunctionDeclaration): string {
		const variableDeclarations = flatten(func.body.body
			.map(stmt => babelTypes.isVariableDeclaration(stmt) ? stmt.declarations : []));

		const variableDeclarators = variableDeclarations
			.filter(varDecl => !!varDecl) as babelTypes.VariableDeclarator[];

		const alias = variableDeclarators
			.map(vd => babelTypes.isThisExpression(vd.init) && babelTypes.isIdentifier(vd.id) ? vd.id.name : null)
			.find(alias => !!alias);

		return alias;
	}

	createClassConstructor(func?: babelTypes.FunctionDeclaration): babelTypes.ClassMethod {
		const id = babelTypes.identifier('constructor');
		const blockStmt = babelTypes.blockStatement([]);

		if (!func) {
			return babelTypes.classMethod('constructor', id, [], blockStmt);
		}

		if (this.options.annotateTypes) {
			for (let index = 0; index < func.params.length; index++) {
				const param = func.params[index];
				if (babelTypes.isIdentifier(param)) {
					this.idMap[param.name] = param;
					this.annotateIdentifier(param);

					const paramProperty = babelTypes.tsParameterProperty(param);
					paramProperty.accessibility = 'private';
					func.params[index] = paramProperty;
				}
			}
		}

		return babelTypes.classMethod('constructor', id, func.params, blockStmt);
	}

	createClassMethod(id: babelTypes.Identifier, func?: babelTypes.FunctionDeclaration | babelTypes.FunctionExpression | babelTypes.ArrowFunctionExpression): babelTypes.ClassMethod {
		let body: babelTypes.BlockStatement;
		if (!func || !func.body) {
			body = babelTypes.blockStatement([]);
		} else if (babelTypes.isBlockStatement(func.body)) {
			body = func.body;
		} else {
			throw Error('Not implemented: convert arrow function to class method');
		}

		return babelTypes.classMethod('method', id, func?.params || [], body);
	}

	createAssignmentToThis(id: babelTypes.Identifier, right: babelTypes.Expression): babelTypes.ExpressionStatement {
		const left = babelTypes.memberExpression(babelTypes.thisExpression(), id);
		const assignment = babelTypes.assignmentExpression('=', left, right);
		return babelTypes.expressionStatement(assignment);
	}

	handleObjectProperty(prop: babelTypes.ObjectMethod | babelTypes.ObjectProperty | babelTypes.SpreadElement) {
		if (!babelTypes.isObjectProperty(prop)) return;

		if (babelTypes.isFunctionExpression(prop.value)) {
			this.appendClassMethod(this.createClassMethod(prop.key, prop.value), prop.key, prop);
		} else if (babelTypes.isLiteral(prop.value)) {
			this.appendConstructorExprStmt(this.createAssignmentToThis(prop.key, prop.value), prop.key, prop);
		}
	}

	handleVariableDeclaration(stmt: babelTypes.VariableDeclaration) {
		for (const varDec of stmt.declarations) {
			if (!babelTypes.isIdentifier(varDec.id)) throw Error('Variable Declarator ID is not Identifier type');

			if (babelTypes.isFunctionExpression(varDec.init)) {
				this.appendClassMethod(this.createClassMethod(varDec.id, varDec.init), varDec.id, varDec);
			} else if (babelTypes.isIdentifier(varDec.id) && varDec.id.name === this.contextAlias) {
				if (!babelTypes.isObjectExpression(varDec.init)) return false;

				for (const prop of varDec.init.properties) {
					this.handleObjectProperty(prop);
				}
			} else if (babelTypes.isExpression(varDec.init)) {
				this.appendConstructorExprStmt(this.createAssignmentToThis(varDec.id, varDec.init), varDec.id, varDec);
			} else {
				throw Error('Unexpected variable declarator');
			}
		}
	}

	appendClassMethod(method: babelTypes.ClassMethod, id: babelTypes.Identifier, copyCommentsFrom: babelTypes.Node): void {
		this.copyComments(copyCommentsFrom, method);
		this.methods.push(method);
		this.idMap[id.name] = method;
	}

	appendConstructorExprStmt(exprStmt: babelTypes.ExpressionStatement, id: babelTypes.Identifier, copyCommentsFrom: babelTypes.Node): void {
		this.copyComments(copyCommentsFrom, exprStmt);
		this.ctor.body.body.push(exprStmt);
		this.idMap[id.name] = exprStmt;

		const typeAnnotation = this.options.annotateTypes
			? this.getTypeAnnotation((exprStmt.expression as babelTypes.AssignmentExpression).right)
			: undefined;
		const property = babelTypes.classProperty(id, undefined, typeAnnotation);
		this.properties.push(property);
	}

	convertIdentifiersToMemberExpressions(): string[] {
		const convertedIds: string[] = [];

		for (const method of this.methods) {
			traverse(method, {
				noScope: true,
				Identifier: (path) => {
					if (!this.idMap[path.node.name]) return;
					const parent = path.parent;
					if (babelTypes.isObjectProperty(parent)) return;
					if (babelTypes.isClassMethod(parent)) return;
					if (babelTypes.isTSParameterProperty(parent)) return;
					if (babelTypes.isMemberExpression(parent)) return;
					if (method.params?.some(p => this.isNamedIdentifier(p, path.node.name))) return;

					const memberExpr = babelTypes.memberExpression(babelTypes.thisExpression(), path.node);
					convertedIds.push(path.node.name);
					path.replaceWith(memberExpr);
				},
				MemberExpression: (path) => {
					const obj = path.node.object;
					if (!babelTypes.isIdentifier(obj)) return;
					if (method.params?.some(p => this.isNamedIdentifier(p, obj.name))) return;

					if (obj.name === this.contextAlias) {
						const memberExpr = babelTypes.memberExpression(babelTypes.thisExpression(), path.node.property);
						convertedIds.push(obj.name);
						path.replaceWith(memberExpr);
						return;
					}

					if (this.idMap[obj.name]) {
						const memberExpr = babelTypes.memberExpression(
							babelTypes.memberExpression(babelTypes.thisExpression(), path.node.object),
							path.node.property);
						convertedIds.push(obj.name);
						path.replaceWith(memberExpr);
						return;
					}
				}
			});
		}

		return uniq(convertedIds);
	}


	convertFunctionExpressionsToArrowFunctionExpressions() {
		for (const method of this.methods) {
			traverse(method, {
				noScope: true,
				FunctionExpression: (path) => {
					let arrowFunction: babelTypes.ArrowFunctionExpression;

					const funcStmts = path.node.body.body;
					const makeFuncExpr = funcStmts.length === 1
						&& babelTypes.isReturnStatement(funcStmts[0])
						&& funcStmts[0].argument
						&& !path.node.leadingComments?.length
						&& !path.node.innerComments?.length
						&& !path.node.trailingComments?.length;

					const returnArg = (funcStmts[0] as babelTypes.ReturnStatement).argument;
					if (makeFuncExpr && returnArg) {
						arrowFunction = babelTypes.arrowFunctionExpression(path.node.params, returnArg);
						arrowFunction.expression = true;
					} else {
						arrowFunction = babelTypes.arrowFunctionExpression(path.node.params, path.node.body);
						this.copyComments(path.node, arrowFunction);
					}

					path.replaceWith(arrowFunction);
				}
			});
		}
	}

	removePrivateKeywordFromUnusedConstructorParams(convertedIds: string[]): void {
		if (convertedIds.length === 0) return;
		this.ctor.params
			.forEach(param => {
				if (!babelTypes.isTSParameterProperty(param))
					return;
				if (!babelTypes.isIdentifier(param.parameter))
					return;
				if (convertedIds.includes(param.parameter.name))
					return;
				param.accessibility = null;
			});
	}

	removeRedundantObjectProperty() {
		for (const method of this.methods) {
			traverse(method, {
				noScope: true,
				ObjectProperty: (path) => {
					if (!this.isNamedIdentifier(path.node.value, path.node.key.name)) return;

					path.node.shorthand = true;
				}
			});
		}
	}

	getRootObject(memberExpr: babelTypes.MemberExpression): babelTypes.Expression {
		let obj = memberExpr.object;
		while (babelTypes.isMemberExpression(obj)) {
			obj = obj.object;
		}
		return obj;
	}

	handleFunctionDeclaration(stmt: babelTypes.FunctionDeclaration) {
		if (!stmt?.id) return;
		this.appendClassMethod(this.createClassMethod(stmt.id, stmt), stmt.id, stmt);
	}

	handleExpressionStatement(stmt: babelTypes.ExpressionStatement) {
		if (!babelTypes.isExpressionStatement(stmt)) return;

		if (babelTypes.isAssignmentExpression(stmt.expression)) {
			this.handleAssignmentExpressionStatement(stmt);
			return;
		}

		this.ctor.body.body.push(stmt);
	}

	handleAssignmentExpressionStatement(stmt: babelTypes.ExpressionStatement, className?: string): boolean {
		if (!babelTypes.isExpressionStatement(stmt)) return false;
		if (!babelTypes.isAssignmentExpression(stmt.expression)) return false;

		const left = stmt.expression.left;
		if (!babelTypes.isMemberExpression(left)) return false;
		if (!babelTypes.isIdentifier(left.property)) return false;
		if (!babelTypes.isThisExpression(left.object)
			&& !(this.contextAlias && this.isNamedIdentifier(left.object, this.contextAlias))
			&& !(className && this.isNamedMemberExpr(left.object, className, 'prototype'))) return false;

		const right = stmt.expression.right;
		const leftId = left.property;
		if (babelTypes.isFunctionExpression(right) || babelTypes.isArrowFunctionExpression(right)) {
			this.appendClassMethod(this.createClassMethod(leftId, right), left.property, stmt);
			return true;
		}

		if (babelTypes.isLiteral(right)) {
			this.appendConstructorExprStmt(this.createAssignmentToThis(leftId, right), leftId, stmt);
			return true;
		}

		if (babelTypes.isIdentifier(right)) {
			if (right.name === leftId.name && this.idMap[leftId.name]) {
				this.copyComments(stmt, this.idMap[leftId.name]);
				return true;
			}
		}

		return false;
	}

	copyComments(srcNode: babelTypes.Node, destNode: babelTypes.Node): void {
		if (!srcNode || !destNode) return;

		const leadingComments = srcNode.leadingComments
			?.filter(comment => !this.copiedComments.some(copied => comment.start === copied));

		if (leadingComments?.length) {
			destNode.leadingComments = (destNode.leadingComments || []).concat(leadingComments);
			this.copiedComments.push(...leadingComments.map(c => c.start));
		}

		if (srcNode.innerComments?.length) {
			destNode.innerComments = (destNode.innerComments || []).concat(srcNode.innerComments);
			this.copiedComments.push(...srcNode.innerComments.map(c => c.start));
		}

		const trailingComments = srcNode.trailingComments
			?.filter(comment => !this.copiedComments.some(copied => comment.start === copied))
			?.filter(c => srcNode.loc != null && c.loc.start.line <= srcNode.loc.end.line);

		if (trailingComments?.length) {
			if (babelTypes.isClassMethod(destNode)) {
				destNode.body.innerComments = (destNode.innerComments || []).concat(trailingComments);
			} else {
				destNode.trailingComments = (destNode.trailingComments || []).concat(trailingComments);
			}
			this.copiedComments.push(...trailingComments.map(c => c.start));
		}
	}

	annotateIdentifier(id: babelTypes.Identifier): void {
		if (!this.options.annotateTypes) return;
		if (!babelTypes.isIdentifier(id)) return;

		if (this.options.angularJs && !id.typeAnnotation && angularJsTypes.hasOwnProperty(id.name)) {
			id.typeAnnotation = babelTypes.tsTypeAnnotation(
				babelTypes.tsTypeReference(
					babelTypes.tsQualifiedName(
						babelTypes.identifier('ng'),
						babelTypes.identifier(angularJsTypes[id.name]))));
		}
	}

	getTypeAnnotation(node: babelTypes.Expression): babelTypes.TypeAnnotation | undefined {
		if (babelTypes.isLiteral(node)) {
			if (babelTypes.isStringLiteral(node)) {
				return babelTypes.typeAnnotation(babelTypes.stringTypeAnnotation());
			}
			if (babelTypes.isNumberLiteral(node)) {
				return babelTypes.typeAnnotation(babelTypes.numberTypeAnnotation());
			}
			if (babelTypes.isBooleanLiteral(node)) {
				return babelTypes.typeAnnotation(babelTypes.booleanTypeAnnotation());
			}
		}
		return undefined; // babelTypes.typeAnnotation(babelTypes.anyTypeAnnotation());
	}
}

export function convertFunctionToClass(source: string, options?: FunctionToClassConverterOptions): string {
	return FunctionToClassConverter.convertFunctionToClass(source, options);
}
