import { convertFunctionToClass } from '../src/convert';

describe('convertFunctionToClass', () => {
	it('factory function that returns object expression', () => {
		const source = cleanSource(`
			function TestService($http, someService) {
				var something = 'something';
			
				var doSomething2 = function doNotUseThisName() {
					return something;
				};

				function testAngular() {
					return $http.get('http://').then(function(response) {
						return response.data;
					});
				}

				return {
					doSomething3: function () {},
					testAngular: testAngular,
					doSomething2: doSomething2,
					doSomething1: doSomething1,
				};
			
				function doSomething1() {
					return something;
				}
			}`);

		const expected = cleanSource(`
			class TestService {
				something: string;

				constructor(private $http: ng.IHttpService, private someService) {
					this.something = 'something';
				}
			
				doSomething1() {
					return this.something;
				}
			
				doSomething2() {
					return this.something;
				}
			
				doSomething3() {}
			
				testAngular() {
					return this.$http.get('http://').then(response => response.data);
				}
			}`);

		const result = convertFunctionToClass(source, true).trim();
		expect(result).toBe(expected);
	});

	it('factory function that returns variable', () => {
		const source = cleanSource(`
			function TestService($http, someService) {
				var service = {};

				// Comment in constructor
				var something = 'something';
			
				var doSomething2 = function doNotUseThisName() {
					return something;
				}
			
				// Comment before service.doSomething2 = doSomething2
				service.doSomething2 = doSomething2; // Comment EOL service.doSomething2 = doSomething2
			
				// Comment before testAngular
				/*
				 * Multi-line comments before testAngular
				 */
				function testAngular() {
					return $http.get('http://').then(function(response) { return response.data; });
				}

				service.doSomething1 = function () {
					// Comment in doSomething1
					return something;
				}
			
				return service;
			}`);

		const expected = cleanSource(`
			class TestService {
				something: string;
			
				constructor(private $http: ng.IHttpService, private someService) {
					this.something = 'something';
				}
			
				doSomething1() {
					// Comment in doSomething1
					return this.something;
				}
			
				// Comment before service.doSomething2 = doSomething2
				doSomething2() {// Comment EOL service.doSomething2 = doSomething2
			
					return this.something;
				}
			
				// Comment before testAngular
			
				/*
				 * Multi-line comments before testAngular
				 */
				testAngular() {
					return this.$http.get('http://').then(response => response.data);
				}
			}`);

		const result = convertFunctionToClass(source, true).trim();
		expect(result).toBe(expected);
	});
});

function cleanSource(source: string) {
	return source.replace(/\n\t\t\t/g, '\n').trimLeft();
}