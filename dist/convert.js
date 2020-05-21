"use strict";
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var babelTypes = __importStar(require("@babel/types"));
var generator_1 = __importDefault(require("@babel/generator"));
var parser_1 = require("@babel/parser");
var traverse_1 = __importDefault(require("@babel/traverse"));
var flatten_1 = __importDefault(require("lodash/flatten"));
var orderBy_1 = __importDefault(require("lodash/orderBy"));
var sortBy_1 = __importDefault(require("lodash/sortBy"));
var uniq_1 = __importDefault(require("lodash/uniq"));
var parseOptions = {
    sourceType: 'module',
    strictMode: false,
    plugins: ['typescript', 'classPrivateProperties', 'classProperties']
};
var babelGeneratorOptions = {
    comments: true
};
var angularJsTypes = {
    $document: 'IDocumentService',
    $http: 'IHttpService',
    $interval: 'IIntervalService',
    $location: 'ILocationService',
    $rootScope: 'IRootScope',
    $scope: 'IScope',
    $timeout: 'ITimeoutService',
    $window: 'IWindowService'
};
;
var defaultOptions = {
    annotateTypes: false,
    angularJs: false
};
var FunctionToClassConverter = /** @class */ (function () {
    function FunctionToClassConverter(options) {
        if (options === void 0) { options = defaultOptions; }
        this.options = options;
        this.properties = [];
        this.methods = [];
        this.idMap = {};
        this.copiedComments = [];
        // Cannot be publicly constructed
    }
    FunctionToClassConverter.convertFunctionToClass = function (source, options) {
        if (!(source === null || source === void 0 ? void 0 : source.trim()))
            throw Error('Source is empty');
        if (source.trim().indexOf('function') === -1)
            throw Error('Source is not a function');
        var ast = parser_1.parse(source, parseOptions);
        if (ast.program.body.length === 0)
            throw Error('Source is empty');
        var converter = new FunctionToClassConverter(options);
        var stmts = converter.convertFunctionToClass(ast.program.body);
        var output = stmts.map(function (stmt) { return generator_1.default(stmt, babelGeneratorOptions).code; }).join('\n\n');
        try {
            // babel generator doesn't allow formatting options. No need to use prettier just for indentation.
            output = FunctionToClassConverter.indentLikeSource(source, output);
        }
        catch (ex) {
            debugger;
            // Ignore error when indenting since it won't change the functionality
        }
        return output;
    };
    FunctionToClassConverter.indentLikeSource = function (source, output) {
        var sourceIndentation = this.detectIndentation(source);
        var outputIndentation = this.detectIndentation(output);
        if (sourceIndentation && outputIndentation && sourceIndentation !== outputIndentation) {
            var indentationRegex = new RegExp("\n(" + outputIndentation + ")+", 'g');
            output = output.replace(indentationRegex, function (match) {
                var levels = match.substr(1).length / outputIndentation.length;
                return '\n' + ''.padStart(levels * sourceIndentation.length, sourceIndentation);
            });
        }
        if (output.substr(output.length - 3, 2) === '\n\n') {
            output = output.substr(0, output.length - 2) + output[output.length - 1];
        }
        return output;
    };
    FunctionToClassConverter.detectIndentation = function (source) {
        var _a;
        if (!source)
            return '';
        if (source.includes('\n\t'))
            return '\t';
        var matches = uniq_1.default(((_a = source.match(/\n +(?!\*)/g)) === null || _a === void 0 ? void 0 : _a.map(function (m) { return m.substr(1); })) || []);
        if (matches.length === 0)
            return '';
        if (matches.length === 1)
            return matches[0];
        var sorted = orderBy_1.default(matches, function (m) { return m.length; }, 'desc');
        var len = sorted[0].length - sorted[1].length;
        return ''.padStart(len, ' ');
    };
    FunctionToClassConverter.prototype.getLastStatement = function (block) {
        for (var index = block.body.length - 1; index >= 0; index--) {
            var node = block.body[index];
            if (babelTypes.isStatement(node) && !babelTypes.isFunctionDeclaration(node)) {
                return node;
            }
        }
    };
    FunctionToClassConverter.prototype.convertFunctionToClass = function (stmts) {
        var _a;
        var func = stmts[0];
        if (!babelTypes.isFunctionDeclaration(func))
            throw Error('Source is not a function');
        var lastStmtInsideFunc = this.getLastStatement(func.body);
        if (babelTypes.isReturnStatement(lastStmtInsideFunc)) {
            if (babelTypes.isIdentifier(lastStmtInsideFunc.argument)) {
                this.contextAlias = lastStmtInsideFunc.argument.name;
            }
            else if (!babelTypes.isObjectExpression(lastStmtInsideFunc.argument)) {
                throw Error('Function has a return statement but does not appear to be a factory function.');
            }
        }
        else {
            this.contextAlias = this.getContextAlias(func);
        }
        this.ctor = this.createClassConstructor(func);
        for (var index = 0; index < func.body.body.length; index++) {
            var stmt = func.body.body[index];
            if (babelTypes.isVariableDeclaration(stmt)) {
                this.handleVariableDeclaration(stmt);
            }
            else if (babelTypes.isFunctionDeclaration(stmt)) {
                this.handleFunctionDeclaration(stmt);
            }
            else if (babelTypes.isExpressionStatement(stmt)) {
                this.handleExpressionStatement(stmt);
            }
            else if (stmt === lastStmtInsideFunc && babelTypes.isReturnStatement(stmt) && babelTypes.isObjectExpression(stmt.argument)) {
                for (var _i = 0, _b = stmt.argument.properties; _i < _b.length; _i++) {
                    var prop = _b[_i];
                    this.handleObjectProperty(prop);
                }
            }
            else if (stmt !== lastStmtInsideFunc && !babelTypes.isEmptyStatement(stmt)) {
                this.ctor.body.body.push(stmt);
            }
        }
        var newStmts = [];
        for (var index = 1; index < stmts.length; index++) {
            var stmt = stmts[index];
            if (babelTypes.isExpressionStatement(stmt)) {
                if (this.handleAssignmentExpressionStatement(stmt, (_a = func.id) === null || _a === void 0 ? void 0 : _a.name))
                    continue;
            }
            newStmts.push(stmt);
        }
        this.properties = sortBy_1.default(this.properties, function (p) { return p.key.name; });
        this.methods = sortBy_1.default(this.methods, function (m) { return m.key.name; });
        if (this.ctor.body.body.length > 0 || this.ctor.params.length > 0) {
            this.methods.unshift(this.ctor);
        }
        var convertedIds = this.convertIdentifiersToMemberExpressions();
        this.removePrivateKeywordFromUnusedConstructorParams(convertedIds);
        this.convertFunctionExpressionsToArrowFunctionExpressions();
        this.removeRedundantObjectProperty();
        var body = babelTypes.classBody(__spreadArrays(this.properties, this.methods));
        var classDeclaration = babelTypes.classDeclaration(func.id, null, body, null);
        newStmts.push(classDeclaration);
        return newStmts;
    };
    FunctionToClassConverter.prototype.isNamedIdentifier = function (node, name) {
        if (babelTypes.isTSParameterProperty(node))
            return this.isNamedIdentifier(node.parameter, name);
        return babelTypes.isIdentifier(node) && node.name === name;
    };
    FunctionToClassConverter.prototype.isNamedMemberExpr = function (memberExpr, objName, propName) {
        if (!babelTypes.isMemberExpression(memberExpr))
            return false;
        return this.isNamedIdentifier(memberExpr.object, objName) && this.isNamedIdentifier(memberExpr.property, propName);
    };
    FunctionToClassConverter.prototype.getContextAlias = function (func) {
        var variableDeclarations = flatten_1.default(func.body.body
            .map(function (stmt) { return babelTypes.isVariableDeclaration(stmt) ? stmt.declarations : []; }));
        var variableDeclarators = variableDeclarations
            .filter(function (varDecl) { return !!varDecl; });
        var alias = variableDeclarators
            .map(function (vd) { return babelTypes.isThisExpression(vd.init) && babelTypes.isIdentifier(vd.id) ? vd.id.name : null; })
            .find(function (alias) { return !!alias; });
        return alias;
    };
    FunctionToClassConverter.prototype.createClassConstructor = function (func) {
        var id = babelTypes.identifier('constructor');
        var blockStmt = babelTypes.blockStatement([]);
        if (!func) {
            return babelTypes.classMethod('constructor', id, [], blockStmt);
        }
        if (this.options.annotateTypes) {
            for (var index = 0; index < func.params.length; index++) {
                var param = func.params[index];
                if (babelTypes.isIdentifier(param)) {
                    this.idMap[param.name] = param;
                    this.annotateIdentifier(param);
                    var paramProperty = babelTypes.tsParameterProperty(param);
                    paramProperty.accessibility = 'private';
                    func.params[index] = paramProperty;
                }
            }
        }
        return babelTypes.classMethod('constructor', id, func.params, blockStmt);
    };
    FunctionToClassConverter.prototype.createClassMethod = function (id, func) {
        var body;
        if (!func || !func.body) {
            body = babelTypes.blockStatement([]);
        }
        else if (babelTypes.isBlockStatement(func.body)) {
            body = func.body;
        }
        else {
            throw Error('Not implemented: convert arrow function to class method');
        }
        return babelTypes.classMethod('method', id, (func === null || func === void 0 ? void 0 : func.params) || [], body);
    };
    FunctionToClassConverter.prototype.createAssignmentToThis = function (id, right) {
        var left = babelTypes.memberExpression(babelTypes.thisExpression(), id);
        var assignment = babelTypes.assignmentExpression('=', left, right);
        return babelTypes.expressionStatement(assignment);
    };
    FunctionToClassConverter.prototype.handleObjectProperty = function (prop) {
        if (!babelTypes.isObjectProperty(prop))
            return;
        if (babelTypes.isFunctionExpression(prop.value)) {
            this.appendClassMethod(this.createClassMethod(prop.key, prop.value), prop.key, prop);
        }
        else if (babelTypes.isLiteral(prop.value)) {
            this.appendConstructorExprStmt(this.createAssignmentToThis(prop.key, prop.value), prop.key, prop);
        }
    };
    FunctionToClassConverter.prototype.handleVariableDeclaration = function (stmt) {
        for (var _i = 0, _a = stmt.declarations; _i < _a.length; _i++) {
            var varDec = _a[_i];
            if (!babelTypes.isIdentifier(varDec.id))
                throw Error('Variable Declarator ID is not Identifier type');
            if (babelTypes.isFunctionExpression(varDec.init)) {
                this.appendClassMethod(this.createClassMethod(varDec.id, varDec.init), varDec.id, varDec);
            }
            else if (babelTypes.isIdentifier(varDec.id) && varDec.id.name === this.contextAlias) {
                if (!babelTypes.isObjectExpression(varDec.init))
                    return false;
                for (var _b = 0, _c = varDec.init.properties; _b < _c.length; _b++) {
                    var prop = _c[_b];
                    this.handleObjectProperty(prop);
                }
            }
            else if (babelTypes.isExpression(varDec.init)) {
                this.appendConstructorExprStmt(this.createAssignmentToThis(varDec.id, varDec.init), varDec.id, varDec);
            }
            else {
                throw Error('Unexpected variable declarator');
            }
        }
    };
    FunctionToClassConverter.prototype.appendClassMethod = function (method, id, copyCommentsFrom) {
        this.copyComments(copyCommentsFrom, method);
        this.methods.push(method);
        this.idMap[id.name] = method;
    };
    FunctionToClassConverter.prototype.appendConstructorExprStmt = function (exprStmt, id, copyCommentsFrom) {
        this.copyComments(copyCommentsFrom, exprStmt);
        this.ctor.body.body.push(exprStmt);
        this.idMap[id.name] = exprStmt;
        var typeAnnotation = this.options.annotateTypes
            ? this.getTypeAnnotation(exprStmt.expression.right)
            : undefined;
        var property = babelTypes.classProperty(id, undefined, typeAnnotation);
        this.properties.push(property);
    };
    FunctionToClassConverter.prototype.convertIdentifiersToMemberExpressions = function () {
        var _this = this;
        var convertedIds = [];
        var _loop_1 = function (method) {
            traverse_1.default(method, {
                noScope: true,
                Identifier: function (path) {
                    var _a;
                    if (!_this.idMap[path.node.name])
                        return;
                    var parent = path.parent;
                    if (babelTypes.isObjectProperty(parent))
                        return;
                    if (babelTypes.isClassMethod(parent))
                        return;
                    if (babelTypes.isTSParameterProperty(parent))
                        return;
                    if (babelTypes.isMemberExpression(parent))
                        return;
                    if ((_a = method.params) === null || _a === void 0 ? void 0 : _a.some(function (p) { return _this.isNamedIdentifier(p, path.node.name); }))
                        return;
                    var memberExpr = babelTypes.memberExpression(babelTypes.thisExpression(), path.node);
                    convertedIds.push(path.node.name);
                    path.replaceWith(memberExpr);
                },
                MemberExpression: function (path) {
                    var _a;
                    var obj = path.node.object;
                    if (!babelTypes.isIdentifier(obj))
                        return;
                    if ((_a = method.params) === null || _a === void 0 ? void 0 : _a.some(function (p) { return _this.isNamedIdentifier(p, obj.name); }))
                        return;
                    if (obj.name === _this.contextAlias) {
                        var memberExpr = babelTypes.memberExpression(babelTypes.thisExpression(), path.node.property);
                        convertedIds.push(obj.name);
                        path.replaceWith(memberExpr);
                        return;
                    }
                    if (_this.idMap[obj.name] && !babelTypes.isMemberExpression(path.node.property)) {
                        var memberExpr = babelTypes.memberExpression(babelTypes.memberExpression(babelTypes.thisExpression(), path.node.object), path.node.property);
                        convertedIds.push(obj.name);
                        path.replaceWith(memberExpr);
                        return;
                    }
                }
            });
        };
        for (var _i = 0, _a = this.methods; _i < _a.length; _i++) {
            var method = _a[_i];
            _loop_1(method);
        }
        return uniq_1.default(convertedIds);
    };
    FunctionToClassConverter.prototype.convertFunctionExpressionsToArrowFunctionExpressions = function () {
        var _this = this;
        for (var _i = 0, _a = this.methods; _i < _a.length; _i++) {
            var method = _a[_i];
            traverse_1.default(method, {
                noScope: true,
                FunctionExpression: function (path) {
                    var _a, _b, _c;
                    var arrowFunction;
                    var funcStmts = path.node.body.body;
                    var makeFuncExpr = funcStmts.length === 1
                        && babelTypes.isReturnStatement(funcStmts[0])
                        && funcStmts[0].argument
                        && !((_a = path.node.leadingComments) === null || _a === void 0 ? void 0 : _a.length)
                        && !((_b = path.node.innerComments) === null || _b === void 0 ? void 0 : _b.length)
                        && !((_c = path.node.trailingComments) === null || _c === void 0 ? void 0 : _c.length);
                    var returnArg = funcStmts[0].argument;
                    if (makeFuncExpr && returnArg) {
                        arrowFunction = babelTypes.arrowFunctionExpression(path.node.params, returnArg);
                        arrowFunction.expression = true;
                    }
                    else {
                        arrowFunction = babelTypes.arrowFunctionExpression(path.node.params, path.node.body);
                        _this.copyComments(path.node, arrowFunction);
                    }
                    path.replaceWith(arrowFunction);
                }
            });
        }
    };
    FunctionToClassConverter.prototype.removePrivateKeywordFromUnusedConstructorParams = function (convertedIds) {
        if (convertedIds.length === 0)
            return;
        this.ctor.params
            .forEach(function (param) {
            if (!babelTypes.isTSParameterProperty(param))
                return;
            if (!babelTypes.isIdentifier(param.parameter))
                return;
            if (convertedIds.includes(param.parameter.name))
                return;
            param.accessibility = null;
        });
    };
    FunctionToClassConverter.prototype.removeRedundantObjectProperty = function () {
        var _this = this;
        for (var _i = 0, _a = this.methods; _i < _a.length; _i++) {
            var method = _a[_i];
            traverse_1.default(method, {
                noScope: true,
                ObjectProperty: function (path) {
                    if (!_this.isNamedIdentifier(path.node.value, path.node.key.name))
                        return;
                    path.node.shorthand = true;
                }
            });
        }
    };
    FunctionToClassConverter.prototype.getRootObject = function (memberExpr) {
        var obj = memberExpr.object;
        while (babelTypes.isMemberExpression(obj)) {
            obj = obj.object;
        }
        return obj;
    };
    FunctionToClassConverter.prototype.handleFunctionDeclaration = function (stmt) {
        if (!(stmt === null || stmt === void 0 ? void 0 : stmt.id))
            return;
        this.appendClassMethod(this.createClassMethod(stmt.id, stmt), stmt.id, stmt);
    };
    FunctionToClassConverter.prototype.handleExpressionStatement = function (stmt) {
        if (!babelTypes.isExpressionStatement(stmt))
            return;
        if (babelTypes.isAssignmentExpression(stmt.expression)) {
            this.handleAssignmentExpressionStatement(stmt);
            return;
        }
        this.ctor.body.body.push(stmt);
    };
    FunctionToClassConverter.prototype.handleAssignmentExpressionStatement = function (stmt, className) {
        if (!babelTypes.isExpressionStatement(stmt))
            return false;
        if (!babelTypes.isAssignmentExpression(stmt.expression))
            return false;
        var left = stmt.expression.left;
        if (!babelTypes.isMemberExpression(left))
            return false;
        if (!babelTypes.isIdentifier(left.property))
            return false;
        if (!babelTypes.isThisExpression(left.object)
            && !(this.contextAlias && this.isNamedIdentifier(left.object, this.contextAlias))
            && !(className && this.isNamedMemberExpr(left.object, className, 'prototype')))
            return false;
        var right = stmt.expression.right;
        var leftId = left.property;
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
    };
    FunctionToClassConverter.prototype.copyComments = function (srcNode, destNode) {
        var _a, _b, _c;
        var _this = this;
        var _d, _e, _f, _g;
        if (!srcNode || !destNode)
            return;
        var leadingComments = (_d = srcNode.leadingComments) === null || _d === void 0 ? void 0 : _d.filter(function (comment) { return !_this.copiedComments.some(function (copied) { return comment.start === copied; }); });
        if (leadingComments === null || leadingComments === void 0 ? void 0 : leadingComments.length) {
            destNode.leadingComments = (destNode.leadingComments || []).concat(leadingComments);
            (_a = this.copiedComments).push.apply(_a, leadingComments.map(function (c) { return c.start; }));
        }
        if ((_e = srcNode.innerComments) === null || _e === void 0 ? void 0 : _e.length) {
            destNode.innerComments = (destNode.innerComments || []).concat(srcNode.innerComments);
            (_b = this.copiedComments).push.apply(_b, srcNode.innerComments.map(function (c) { return c.start; }));
        }
        var trailingComments = (_g = (_f = srcNode.trailingComments) === null || _f === void 0 ? void 0 : _f.filter(function (comment) { return !_this.copiedComments.some(function (copied) { return comment.start === copied; }); })) === null || _g === void 0 ? void 0 : _g.filter(function (c) { return srcNode.loc != null && c.loc.start.line <= srcNode.loc.end.line; });
        if (trailingComments === null || trailingComments === void 0 ? void 0 : trailingComments.length) {
            if (babelTypes.isClassMethod(destNode)) {
                destNode.body.innerComments = (destNode.innerComments || []).concat(trailingComments);
            }
            else {
                destNode.trailingComments = (destNode.trailingComments || []).concat(trailingComments);
            }
            (_c = this.copiedComments).push.apply(_c, trailingComments.map(function (c) { return c.start; }));
        }
    };
    FunctionToClassConverter.prototype.annotateIdentifier = function (id) {
        if (!this.options.annotateTypes)
            return;
        if (!babelTypes.isIdentifier(id))
            return;
        if (this.options.angularJs && !id.typeAnnotation && angularJsTypes.hasOwnProperty(id.name)) {
            id.typeAnnotation = babelTypes.tsTypeAnnotation(babelTypes.tsTypeReference(babelTypes.tsQualifiedName(babelTypes.identifier('ng'), babelTypes.identifier(angularJsTypes[id.name]))));
        }
    };
    FunctionToClassConverter.prototype.getTypeAnnotation = function (node) {
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
    };
    return FunctionToClassConverter;
}());
function convertFunctionToClass(source, options) {
    return FunctionToClassConverter.convertFunctionToClass(source, options);
}
exports.convertFunctionToClass = convertFunctionToClass;
//# sourceMappingURL=convert.js.map