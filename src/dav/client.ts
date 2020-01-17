import axios, { AxiosInstance, AxiosBasicCredentials, AxiosRequestConfig } from 'axios';
import { FileProps } from './fileprops';
import {DOMParser} from 'xmldom';
interface MultiStatusResponse {
    href: string|null,
    propStat: Array<PropertyStatus>
}

interface PropertyStatus {
    status: string,
    properties: object
}

export class Client {

    private xmlNamespaces: object = {
        'DAV:': 'd',
        'http://owncloud.org/ns': 'oc',
        'http://nextcloud.org/ns': 'nc',
        'http://open-collaboration-services.org/ns': 'ocs'
    };

    private _connection: AxiosInstance;

    constructor(connection: AxiosInstance) {
        this._connection = connection;
    }

    static create(baseURL: string, auth: AxiosBasicCredentials) {
        return new Client(axios.create({ baseURL, auth }))
    }

    async fileprops(path: string): Promise<FileProps> {
        // @ts-ignore axios doesn't have PROPFIND method
        const response = await this._connection({
            method: 'PROPFIND',
            url: path,
            data: `<?xml version="1.0"?>
				<d:propfind  xmlns:d="DAV:"
					xmlns:oc="http://owncloud.org/ns"
					xmlns:nc="http://nextcloud.org/ns"
					xmlns:ocs="http://open-collaboration-services.org/ns">
				<d:prop>
					<oc:fileid />
					<oc:foreign-id />
				</d:prop>
				</d:propfind>`,
        });
        const parsed: Array<MultiStatusResponse> = this.parseMultiStatus(response.data)
        let first: MultiStatusResponse = parsed[0];
        if (first.propStat.length === 0 || first.propStat[0].status !== 'HTTP/1.1 200 OK') {
            throw new Error(`Can't find file ${path}. ${first.propStat[0].status}`);
        }
        const props = Object.keys(first.propStat[0].properties).reduce((carry, key) => {
            const name:string = key.replace('{http://owncloud.org/ns}', '');
            carry[name] = first.propStat[0].properties[key]
            return carry
        }, {});
        return new FileProps(path, props);
    }

    private parseMultiStatus(doc: string): Array<MultiStatusResponse> {
        let result: Array<MultiStatusResponse> = [];
        const xmlNamespaces: object = this.xmlNamespaces;
        const resolver: Function = function (namespace: string) {
            let ii: string;
            for (ii in xmlNamespaces) {
                if (xmlNamespaces[ii] === namespace) {
                    return ii;
                }
            }
            return undefined;
        }.bind(this);

        const responses = this.getElementsByTagName(doc, 'd:response', resolver);
        let i: number;
        for (i = 0; i < responses.length; i++) {
            let responseNode: any = responses[i];
            let response: MultiStatusResponse = {
                href: null,
                propStat: []
            };

            let hrefNode: any = this.getElementsByTagName(responseNode, 'd:href', resolver)[0];

            response.href = hrefNode.textContent || hrefNode.text;

            let propStatNodes = this.getElementsByTagName(responseNode, 'd:propstat', resolver);
            let j: number = 0;

            for (j = 0; j < propStatNodes.length; j++) {
                let propStatNode: any = propStatNodes[j];
                let statusNode: any = this.getElementsByTagName(propStatNode, 'd:status', resolver)[0];

                let propStat: PropertyStatus = {
                    status: statusNode.textContent || statusNode.text,
                    properties: {}
                };

                let propNode: any = this.getElementsByTagName(propStatNode, 'd:prop', resolver)[0];
                if (!propNode) {
                    continue;
                }
                let k: number = 0;
                for (k = 0; k < propNode.childNodes.length; k++) {
                    let prop: any = propNode.childNodes[k];
                    let value: any = this.parsePropNode(prop);
                    propStat.properties['{' + prop.namespaceURI + '}' + (prop.localName || prop.baseName)] = value;

                }
                response.propStat.push(propStat);
            }

            result.push(response);
        }

        return result;

    }

    private parsePropNode(e: any): string {
        let t: Array<any>|null = null;
        if (e.childNodes && e.childNodes.length > 0) {
            let n: Array<any> = [];
            for (let r: number = 0; r < e.childNodes.length; r++) {
                let i: any = e.childNodes[r];
                if (1 === i.nodeType) n.push(i);
            }
            if (n.length) {
                t = n;
            }
        }
        return t || e.textContent || e.text || "";
    };

    private getElementsByTagName(node: any, name: string, resolver: Function): any {
        let parts: Array<string> = name.split(':');
        let tagName: string = parts[1];
        let namespace: string = resolver(parts[0]);
        if (typeof node === 'string') {
            let parser: DOMParser = new DOMParser()
            node = parser.parseFromString(node, 'text/xml')
        }
        if (node.getElementsByTagNameNS) {
            return node.getElementsByTagNameNS(namespace, tagName);
        }
        return node.getElementsByTagName(name);
    };


}