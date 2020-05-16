import { convertFunctionToClass } from '../src/convert';

describe('convertFunctionToClass', () => {
	const source = cleanSource(`
			function TestService($http, someService) {
				this.something = 'something';
			}

			var someConstant = 'Hello World';
			
			TestService.prototype.doSomething2 = function doNotUseThisName() {
				return this.doSomething1();
			};

			TestService.prototype.doSomething1 = function() {
				return someConstant;
			}`);

	it('Without type annotations (no TypeScript)', () => {
		const expected = cleanSource(`
			var someConstant = 'Hello World';
			
			class TestService {
				something;

				constructor($http, someService) {
					this.something = 'something';
				}
			
				doSomething1() {
					return someConstant;
				}
			
				doSomething2() {
					return this.doSomething1();
				}
			}`);

		const options = {
			annotateTypes: false,
			angularJs: true
		};

		const result = convertFunctionToClass(source, options).trim();
		expect(result).toBe(expected);
	});

	it('With type annotations but without AngularJS service name matching', () => {
		const expected = cleanSource(`
			var someConstant = 'Hello World';
			
			class TestService {
				something: string;

				constructor(private $http, private someService) {
					this.something = 'something';
				}
			
				doSomething1() {
					return someConstant;
				}
			
				doSomething2() {
					return this.doSomething1();
				}
			}`);


		const options = {
			annotateTypes: true,
			angularJs: false
		};

		const result = convertFunctionToClass(source, options).trim();
		expect(result).toBe(expected);
	});
});

function cleanSource(source: string) {
	return source.replace(/\n\t\t\t/g, '\n').trimLeft();
}