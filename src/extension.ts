'use strict';

import * as vscode from 'vscode';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri} from 'vscode';
import Viz = require("viz.js");
import {PreviewDocumentUtils, AbstractPreviewDocumentContentProvider, PreviewDocumentController} from './previewprovider';

export function activate(context: ExtensionContext) {

    console.log('"dot-viewer" is now active!');

	const languageId = "dot";
	const scheme = "dot-viewer";
	let dotDocumentProvider: DotDocumentProvider = new DotDocumentProvider();
	let previewDocumentController: PreviewDocumentController = new PreviewDocumentController(languageId, scheme, dotDocumentProvider);

    context.subscriptions.push(previewDocumentController);
}

export function deactivate() {
}



class DotDocumentProvider extends AbstractPreviewDocumentContentProvider {

    public openPreviewDocument(uri: Uri): string | Thenable<string> {
        let previewUri: Uri = PreviewDocumentUtils.getTextDocumentUri(uri);
        return vscode.workspace.openTextDocument(previewUri).then(doc => {

			let html = null;
            try {
                const text = doc.getText();
				html = this.render(text);
            } catch (e) {
				vscode.window.showErrorMessage("[DOT Viewer]:" + e.message ? e.message : e);
                console.log(e);
            }

            return html;
        }, (e) => {
			vscode.window.showErrorMessage("[DOT Viewer]:" + e.message ? e.message : e);
			console.error("openPreviewDocument error", e);
			debugger;
        });
    }

	public render(text: string): string {
		// Dot Format check
		let parse = require('dotparser');
		let ast = parse(text); // format error Exception

		// パースに成功した場合
		let graphTag: string = Viz(text);
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