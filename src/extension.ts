'use strict';

import * as vscode from 'vscode';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri} from 'vscode';
import Viz = require("viz.js");
import {PreviewDocumentUtils, AbstractPreviewDocumentContentProvider, PreviewDocumentController} from './previewprovider';

export function activate(context: ExtensionContext) {

    console.log('DOT Viewer is now active!');

	const languageId = "dot";
	const scheme = "dot-viewer";
	let dotDocumentProvider: DotDocumentProvider = new DotDocumentProvider();
	let previewDocumentController: PreviewDocumentController = new PreviewDocumentController(languageId, scheme, dotDocumentProvider);

    context.subscriptions.push(previewDocumentController);
}

export function deactivate() {
}

class DotDocumentProvider extends AbstractPreviewDocumentContentProvider {
    private _parser;

	constructor(eventDelay?: number) {
        super(eventDelay);
        this._parser = require('dotparser');
    }

    public render(text: string): string {
		let ast = this._parser(text); // format error Exception

		// パースに成功した場合
		let graphTag: string = Viz(text);
        return graphTag;        
    }

	public renderHtml(text: string): string {
		let graphTag: string = this.render(text);
		return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>DOT Viewer</title>
  </head>
  <body>
  ${graphTag}
  </body>
</html>
`;
	}
}