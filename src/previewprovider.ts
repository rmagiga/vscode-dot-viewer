'use strict';

import * as vscode from 'vscode';
import {TextDocumentContentProvider, EventEmitter, Uri, Event, Disposable, TextEditor, TextDocument, ViewColumn} from 'vscode';
import * as path from 'path';

export class PreviewDocumentUtils {
	static createPreviewDocumentUri(scheme: string, uri: Uri): Uri {
		return uri.with({ scheme: scheme, path: scheme, query: uri.toString() });
	}

	static getTextDocumentUri(uri: Uri): Uri {
		return Uri.parse(uri.query);
	}

	static getSinglePreviewTextDocumentUri(uri: Uri): Uri {
		return this.getPreviewTextDocumentUri(uri, true);
	}

	static getPreviewTextDocumentUri(uri: Uri, isOutputQuery: boolean = false): Uri {
		return isOutputQuery ? uri : uri.with({ query: '' });
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

	public abstract openPreviewDocument(uri: Uri): string | Thenable<string>;
	public abstract render(text: string): string;

	private isInt(num: number): boolean {
		return (num % 1 === 0);
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
	// private _autoFirstShowView: boolean;

	private _previewDocumentContentProvider: AbstractPreviewDocumentContentProvider;

	constructor(languageId: string, scheme: string, previewDocumentContentProvider: AbstractPreviewDocumentContentProvider) {
		this._languageId = languageId;
		this._scheme = scheme;
		this._previewDocumentContentProvider = previewDocumentContentProvider;
		let subscriptions: Disposable[] = [];

		let showViewerCommandId = this._scheme + '.showViewer';

		// TextDocumentContentProviderの登録
		let registration = vscode.workspace.registerTextDocumentContentProvider(scheme, previewDocumentContentProvider);
		subscriptions.push(registration);

		// コマンド
		let showViewerCommand = vscode.commands.registerCommand(showViewerCommandId, (uri) => {
			this.showViewer(uri);
		});
		subscriptions.push(showViewerCommand);

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

	public isPreviewDocument(document: TextDocument): boolean {
		let isPreview: boolean = false;
		if (document && !document.isUntitled) {
			if (document.languageId === this._languageId && document.uri.scheme !== this._scheme) {
				isPreview = true;
			}
		}
		return isPreview;
	}


	public showViewer(uri?: Uri): void {
		try {
			let targetUri = uri;
			if (!(targetUri instanceof Uri)) {
				if (vscode.window.activeTextEditor) {
					targetUri = vscode.window.activeTextEditor.document.uri;
				} else {
					return;
				}
			}

			let previewUri = PreviewDocumentUtils.createPreviewDocumentUri(this._scheme, targetUri);
			let basename = path.basename(targetUri.fsPath);
			vscode.commands.executeCommand('vscode.previewHtml', previewUri, this.getPreviewViewColumn(targetUri), '/' + basename).then((success) => {
			}, (reason) => {
				vscode.window.showErrorMessage(reason);
			});

		} catch (e) {
			console.error(e);
			debugger;
		}


	}

	public getPreviewViewColumn(uri: Uri): ViewColumn {
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
		let viewColumn: ViewColumn;
		switch (targetTextEditor.viewColumn) {
			case ViewColumn.One:
				viewColumn = ViewColumn.Two;
				break;
			case ViewColumn.Two:
				viewColumn = ViewColumn.Three;
				break;
			default:
				viewColumn = ViewColumn.One;
				break;
		}

		return viewColumn;
	}

	// public isPreviewDocument1(document: TextDocument): boolean {
	// 	let isPreview: boolean = false;
	// 	if (document && !document.isUntitled) {
	// 		if (document.languageId === this._languageId && document.uri.scheme !== this._scheme) {
	// 			isPreview = true;
	// 		}
	// 	}
	// 	return isPreview;
	// }

	// public showViewer1(document: TextDocument): void {
	// 	try {
	// 		// プレビュー可能なテキストか
	// 		if (!this.isPreviewDocument1(document)) {
	// 			return;
	// 		}

	// 		let previewUri = PreviewDocumentUtils.createPreviewDocumentUri(this._scheme, document.uri);
	// 		let basename = path.basename(document.uri.fsPath);

	// 		vscode.commands.executeCommand('vscode.previewHtml', previewUri, this.getPreviewViewColumn1(document), '/' + basename).then((success) => {
	// 		}, (reason) => {
	// 			vscode.window.showErrorMessage(reason);
	// 		});

	// 	} catch (e) {
	// 		console.error(e);
	// 		debugger;
	// 	}
	// }

	// public getPreviewViewColumn1(document: TextDocument): ViewColumn {
	// 	let targetTextEditor: TextEditor = null;

	// 	const visibleTextEditors: TextEditor[] = vscode.window.visibleTextEditors;
	// 	for (let textEditor of visibleTextEditors) {
	// 		if (textEditor.document === document) {
	// 			targetTextEditor = textEditor;
	// 			break;
	// 		}
	// 	}

	// 	let textEditor = vscode.window.activeTextEditor;
	// 	if (textEditor) {
	// 		console.log(textEditor.document.uri.toString());

	// 	}

	// 	if (!targetTextEditor) {
	// 		return ViewColumn.Two;
	// 	}

	// 	// プレビュー画面は、Three以外は、右側に表示する
	// 	let viewColumn: ViewColumn;
	// 	switch (targetTextEditor.viewColumn) {
	// 		case ViewColumn.One:
	// 			viewColumn = ViewColumn.Two;
	// 			break;
	// 		case ViewColumn.Two:
	// 			viewColumn = ViewColumn.Three;
	// 			break;
	// 		default:
	// 			viewColumn = ViewColumn.One;
	// 			break;
	// 	}

	// 	return viewColumn;
	// }

	public dispose() {
		this._disposable.dispose();
	}

}