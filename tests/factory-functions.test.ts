import { convertFunctionToClass } from '../src/convert';

const options = {
	annotateTypes: true,
	angularJs: true
};

describe('convertFunctionToClass', () => {
	it('factory function that returns object expression', () => {
		const source = cleanSource(`
			function TestService($http, unusedService) {
				var something = 'something';
			
				var doSomething2 = function doNotUseThisName() {
					return something;
				};

				function testAngular() {
					return $http.get('http://').then(function(response) {
						return response.data;
					});
				}

				doSomething1();

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

				constructor(private $http: ng.IHttpService, unusedService) {
					this.something = 'something';
					this.doSomething1();
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

		const result = convertFunctionToClass(source, options).trim();
		expect(result).toBe(expected);
	});

	it('factory function that returns variable', () => {
		const source = cleanSource(`
			function TestService($http, someService) {
				var service = {};

				// Comment in constructor
				var something = someService.getSomething();
			
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
				something;
			
				constructor(private $http: ng.IHttpService, someService) {
					this.something = someService.getSomething();
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

		const result = convertFunctionToClass(source, options).trim();
		expect(result).toBe(expected);
	});

	it('factory function that initializes a shared variable', () => {
		const source = cleanSource(`
			function TestService(someFactory, someService) {
				var something1 = someFactory();
				var something2 = new someService();
				var something3 = something2.something();

				return {
					getSomething: function () {
						return {
							something1: something1,
							something2: something2,
							something3: something3
						};
					}
				}
			}`);

		const expected = cleanSource(`
			class TestService {
				something1;
				something2;
				something3;

				constructor(someFactory, someService) {
					this.something1 = someFactory();
					this.something2 = new someService();
					this.something3 = this.something2.something();
				}

				getSomething() {
					return {
						something1,
						something2,
						something3
					};
				}
			}`);

		const result = convertFunctionToClass(source, options).trim();
		expect(result).toBe(expected);
	});
});

function cleanSource(source: string) {
	return source.replace(/\n\t\t\t/g, '\n').trimLeft();
}