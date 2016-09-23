'use strict';

import * as vscode from 'vscode';
import {TextDocumentContentProvider, EventEmitter, Uri, Event, Disposable, TextEditor, TextDocument, ViewColumn} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class PreviewDocumentUtils {
	static createPreviewDocumentUri(scheme: string, uri: Uri): Uri {
		return uri.with({ scheme: scheme, path: scheme, query: uri.toString() });
	}

	static getTextDocumentUri(uri: Uri): Uri {
		return Uri.parse(uri.query);
	}
}

export abstract class AbstractPreviewDocumentContentProvider implements TextDocumentContentProvider {

	private _onDidChange: EventEmitter<Uri>;
	private _isWaiting: boolean;
	private _eventDelay: number;

	constructor(eventDelay?: number) {
		this._onDidChange = new EventEmitter<Uri>();
		this._isWaiting = false;
		this._eventDelay = this.isInt(eventDelay) ? eventDelay : 300;
	}

	public abstract render(text: string): string;
	public abstract renderHtml(text: string): string;

	private isInt(num: number): boolean {
		return (num % 1 === 0);
	}

    public openPreviewDocument(uri: Uri): string | Thenable<string> {
        let previewUri: Uri = PreviewDocumentUtils.getTextDocumentUri(uri);
        return vscode.workspace.openTextDocument(previewUri).then(doc => {

			let html = null;
			const text = doc.getText();
			html = this.renderHtml(text);
            // try {
            //     const text = doc.getText();
			// 	html = this.renderHtml(text);
            // } catch (e) {
			// 	vscode.window.showErrorMessage("[DOT Viewer]:" + e.message ? e.message : e);
            //     console.log(e);
            // }

            return html;
        }, (e) => {
			vscode.window.showErrorMessage("[DOT Viewer]:" + e.message ? e.message : e);
			console.error("openPreviewDocument error", e);
			debugger;
        });
    }

	public provideTextDocumentContent(uri: Uri): string | Thenable<string> {
		let ret: string | Thenable<string> = null;
		try {
			ret = this.openPreviewDocument(uri);
		} catch (e) {
			console.error(e);
			throw e;
		}
		return ret;
	}

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    public previewUpdate(uri: Uri) {
        if (!this._isWaiting) {
            this._isWaiting = true;
            setTimeout(() => {
                this._isWaiting = false;
                this._onDidChange.fire(uri);
            }, this._eventDelay);
        }
    }
}

export class PreviewDocumentController {
    private _disposable: Disposable;
	private _scheme: string;
	private _languageId: string;

	private _previewDocumentContentProvider: AbstractPreviewDocumentContentProvider;

	constructor(languageId: string, scheme: string, previewDocumentContentProvider: AbstractPreviewDocumentContentProvider) {
		this._languageId = languageId;
		this._scheme = scheme;
		this._previewDocumentContentProvider = previewDocumentContentProvider;
		let subscriptions: Disposable[] = [];

		let showViewerCommandId = this._scheme + '.showViewer';
		let exportSvgCommandId = this._scheme + '.exportSvg'

		// TextDocumentContentProviderの登録
		let registration = vscode.workspace.registerTextDocumentContentProvider(scheme, previewDocumentContentProvider);
		subscriptions.push(registration);

		// コマンド登録
		// Editor GroupのViewColumn.Oneを開く
		let showViewerCommand = vscode.commands.registerCommand(showViewerCommandId, (uri) => {
			this.showEditorGroupViewer(uri, vscode.ViewColumn.One);
		});
		subscriptions.push(showViewerCommand);

		// export svg
		let exportSvgCommand = vscode.commands.registerCommand(exportSvgCommandId, (uri) => {
			this.exportFileSvg(uri);
		});
		subscriptions.push(exportSvgCommand);


		// テキストが変更された時
		vscode.workspace.onDidChangeTextDocument(event => {
			if (this.isPreviewDocument(event.document)) {
				let previewUri = PreviewDocumentUtils.createPreviewDocumentUri(this._scheme, event.document.uri);
				this._previewDocumentContentProvider.previewUpdate(previewUri);
			}
		});

		// 保存された時
		vscode.workspace.onDidSaveTextDocument(document => {
			if (this.isPreviewDocument(document)) {
				let previewUri = PreviewDocumentUtils.createPreviewDocumentUri(this._scheme, document.uri);
				this._previewDocumentContentProvider.previewUpdate(previewUri);
			}
		})

		// 設定ファイルが更新された時
		vscode.workspace.onDidChangeConfiguration(() => {
			vscode.workspace.textDocuments.forEach(document => {
				if (document.uri.scheme === this._scheme) {
					// すべてのプレビュー画面を更新
					this._previewDocumentContentProvider.previewUpdate(document.uri);
				}
			});
		});

        this._disposable = Disposable.from(...subscriptions);
	}

	public exportFileSvg(uri: string) {
		if (!uri) {
			if (vscode.window.activeTextEditor) {
				uri = vscode.window.activeTextEditor.document.uri.fsPath;
			}
		}

		vscode.workspace.openTextDocument(uri).then(doc => {
			try {
				if (this.isPreviewDocument(doc)) {
					let svg: string = this._previewDocumentContentProvider.render(doc.getText());
					let pathObj = path.parse(doc.uri.fsPath);
					let prompt = "Export: " + pathObj.base;
					pathObj.base = pathObj.name + ".svg";
					let filename = path.format(pathObj);

					vscode.window.showInputBox({ value: filename, prompt: prompt }).then(val => {
						fs.writeFile(filename, svg);
					});
				}
			} catch (e) {
				vscode.window.showErrorMessage("[DOT Viewer]:" + e.message ? e.message : e);
                console.log(e);
            }

		});
	}

	public isPreviewDocument(document: TextDocument): boolean {
		let isPreview: boolean = false;
		if (document && !document.isUntitled) {
			if (document.languageId === this._languageId && document.uri.scheme !== this._scheme) {
				isPreview = true;
			}
		}
		return isPreview;
	}


	public showEditorGroupViewer(uri?: Uri, viewColumn?: vscode.ViewColumn): void {
		try {
			let targetUri = uri;
			if (!(targetUri instanceof Uri)) {
				if (vscode.window.activeTextEditor) {
					if (this.isPreviewDocument(vscode.window.activeTextEditor.document)) {
						targetUri = vscode.window.activeTextEditor.document.uri;
					} else {
						targetUri = vscode.window.activeTextEditor.document.uri;
					}
				} else {
					return;
				}
			}

			let previewUri = PreviewDocumentUtils.createPreviewDocumentUri(this._scheme, targetUri);
			let basename = path.basename(targetUri.fsPath);
			vscode.commands.executeCommand('vscode.previewHtml', previewUri, this.getPreviewViewColumn(targetUri, viewColumn), '/' + basename).then((success) => {
			}, (reason) => {
				vscode.window.showErrorMessage(reason);
			});

		} catch (e) {
			console.error(e);
			debugger;
		}
	}

	public getPreviewViewColumn(uri: Uri, viewColumn?: vscode.ViewColumn): ViewColumn {
		if (viewColumn) {
			return viewColumn;
		}

		let targetTextEditor: TextEditor = null;

		const visibleTextEditors: TextEditor[] = vscode.window.visibleTextEditors;
		for (let textEditor of visibleTextEditors) {
			if (textEditor.document.uri === uri) {
				targetTextEditor = textEditor;
				break;
			}
		}

		if (!targetTextEditor) {
			let textEditor = vscode.window.activeTextEditor;
			if (textEditor && textEditor.document.uri === uri) {
				targetTextEditor = textEditor;
			}
		}

		if (!targetTextEditor) {
			return ViewColumn.One;
		}

		// プレビュー画面は、Three以外は、右側に表示する
		let targetViewColumn: ViewColumn;
		switch (targetTextEditor.viewColumn) {
			case ViewColumn.One:
				targetViewColumn = ViewColumn.Two;
				break;
			case ViewColumn.Two:
				targetViewColumn = ViewColumn.Three;
				break;
			default:
				targetViewColumn = ViewColumn.One;
				break;
		}

		return targetViewColumn;
	}

	public dispose() {
		this._disposable.dispose();
	}

}