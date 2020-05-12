// import { PluginObj } from '@babel/core'
// import { NodePath } from '@babel/traverse'
// import * as t from '@babel/types'
// import * as m from '@codemod/matchers'
// import * as jscodeshift from 'jscodeshift';
// import { FunctionExpressionMatcher } from '@codemod/matchers';

// export default function () {
// 	return {
// 		visitor: {
// 			FunctionExpression(path: NodePath<t.FunctionExpression>): void {
// 				path.node.id
// 			}
// 		}
// 	};
// }

// export default function transformer(file: jscodeshift.FileInfo, api: jscodeshift.API, options: jscodeshift.Options): PluginObj {
	// const j = api.jscodeshift;

	// const funcName = m.capture(m.anything());
	// const argumentNameMatcher = m.capture(m.anyString())
	// // const params = m.capture();

	// return j(file.source)
	// 	// m.functionExpression(m.anything(), [m.identifier(m.anything())])
	// 	.find(
	// 		j.FunctionExpression,
	// 		{

	// 		} as FunctionExpressionMatcher
	// 	)
	// 	// funcName,
	// 	// [m.identifier(argumentNameMatcher)],
	// 	// m.blockStatement([
	// 	// 	m.returnStatement(),
	// 	// ])
	// 	// .find(j.functionExpression(funcName))
	// 	//.forEach(path => {
	// 	//j(path).replaceWith(
	// 	//j.identifier(path.node.name.split('')join(''))
	// 	//);
	// 	//})
	// 	.toSource();
// }
