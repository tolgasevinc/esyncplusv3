declare module 'xslt-processor' {
  export class Xslt {
    constructor(options?: { outputMethod?: string; fetchFunction?: (uri: string) => Promise<string> })
    xsltProcess(xmlDoc: unknown, xsltDoc: unknown): Promise<string>
  }
  export class XmlParser {
    xmlParse(xmlString: string): unknown
  }
}
