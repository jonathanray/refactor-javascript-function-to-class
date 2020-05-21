import { convertFunctionToClass } from '../src/convert';

const options = {
	annotateTypes: true,
	angularJs: true
};

describe('convertFunctionToClass', () => {
	const expected = cleanSource(`
			class TestService {
				something: string;

				constructor(private $http: ng.IHttpService, unusedService) {
					this.something = 'something';
				}
			
				doSomething1() {
					return this.something;
				}
			
				doSomething2() {
					return this.something;
				}
			
				testAngular() {
					return this.$http.get('http://').then(response => response.data);
				}
			}`);

	it('constructor function assigning to "this"', () => {
		const source = cleanSource(`
			function TestService($http, unusedService) {
				var something = 'something';
				this.something = something;
		
				this.doSomething1 = function doSomething1() {
					return this.something;
				}
		
				var doSomething2 = function doNotUseThisName() {
					return something;
				}
		
				this.doSomething2 = doSomething2;
		
				function testAngular() {
					return $http.get('http://').then(function(response) {
						return response.data;
					});
				}
			}`);

		const result = convertFunctionToClass(source, options).trim();
		expect(result).toBe(expected);
	});

	it('constructor function assigning to "this"', () => {
		const source = cleanSource(`
			function TestService($http, unusedService) {
				var self = this;
				self.something = 'something';
		
				self.doSomething1 = function doSomething1() {
					return this.something;
				}
		
				var doSomething2 = function doNotUseThisName() {
					return self.something;
				}
		
				self.doSomething2 = doSomething2;
		
				function testAngular() {
					return $http.get('http://').then(function(response) {
						return response.data;
					});
				}
			}`);

		const result = convertFunctionToClass(source, options).trim();
		expect(result).toBe(expected);
	});
});

function cleanSource(source: string) {
	return source.replace(/\n\t\t\t/g, '\n').trimLeft();
}