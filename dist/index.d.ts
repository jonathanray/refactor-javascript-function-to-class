export interface FunctionToClassConverterOptions {
    annotateTypes?: boolean;
    angularJs?: boolean;
}
export declare function convertFunctionToClass(source: string, options?: FunctionToClassConverterOptions): string;
