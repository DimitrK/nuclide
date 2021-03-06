'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {
   nuclide_debugger$Service,
   NuclideDebuggerProvider,
} from '../../interfaces/service';
import type {SerializedBreakpoint} from './BreakpointStore';

import invariant from 'assert';
import {CompositeDisposable, Disposable} from 'atom';
import {trackTiming} from '../../../analytics';
import RemoteControlService from './RemoteControlService';
import DebuggerModel from './DebuggerModel';
import {
  React,
  ReactDOM,
} from 'react-for-atom';
import {DebuggerLaunchAttachUI} from './DebuggerLaunchAttachUI';

export type SerializedState = {
  breakpoints: ?Array<SerializedBreakpoint>;
};

function createDebuggerView(model: DebuggerModel): HTMLElement {
  const DebuggerControllerView = require('./DebuggerControllerView');
  const elem = document.createElement('div');
  elem.className = 'nuclide-debugger-root';
  ReactDOM.render(
    <DebuggerControllerView
      store={model.getStore()}
      bridge = {model.getBridge()}
      actions={model.getActions()}
      breakpointStore={model.getBreakpointStore()}
    />,
    elem);
  return elem;
}

class Activation {
  _disposables: CompositeDisposable;
  _model: DebuggerModel;
  _panel: ?Object;
  _launchAttachDialog: ?atom$Panel;

  constructor(state: ?SerializedState) {
    this._model = new DebuggerModel(state);
    this._panel = null;
    this._launchAttachDialog = null;
    this._disposables = new CompositeDisposable(
      this._model,
      atom.views.addViewProvider(DebuggerModel, createDebuggerView),

      // Listen for removed projects and kill the associated debugger if it is attached.
      atom.project.onDidChangePaths(projectPaths => {
        const debuggerProcess = this._model.getStore().getDebuggerProcess();
        if (debuggerProcess == null) {
          return;
        }
        const debugeeProjectPath = debuggerProcess.getTargetUri();
        if (projectPaths.indexOf(debugeeProjectPath) < 0) {
          this._model.getActions().killDebugger();
        }
      }),

      // Commands.
      atom.commands.add('atom-workspace', {
        'nuclide-debugger:toggle': this._toggle.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'nuclide-debugger:show': this._show.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'nuclide-debugger:continue-debugging': this._continue.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'nuclide-debugger:stop-debugging': this._stop.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'nuclide-debugger:step-over': this._stepOver.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'nuclide-debugger:step-into': this._stepInto.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'nuclide-debugger:step-out': this._stepOut.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'nuclide-debugger:toggle-breakpoint': this._toggleBreakpoint.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'nuclide-debugger:toggle-launch-attach': this._toggleLaunchAttachDialog.bind(this),
      }),

      // Context Menu Items.
      atom.contextMenu.add({
        'atom-text-editor': [
          {type: 'separator'},
          {
            label: 'Debugger',
            submenu: [
              {
                label: 'Toggle Breakpoint',
                command: 'nuclide-debugger:toggle-breakpoint',
              },
            ],
          },
          {type: 'separator'},
        ],
      }),
    );
    (this: any)._hideLaunchAttachDialog = this._hideLaunchAttachDialog.bind(this);
  }

  serialize(): SerializedState {
    const state = {
      breakpoints: this.getModel().getBreakpointStore().getSerializedBreakpoints(),
    };
    return state;
  }

  dispose() {
    this._disposables.dispose();
    if (this._panel) {
      this._panel.destroy();
    }
  }

  getModel(): DebuggerModel {
    return this._model;
  }

  _toggle() {
    const panel = this._getPanel();
    if (panel.isVisible()) {
      panel.hide();
    } else {
      panel.show();
    }
  }

  _show() {
    this._getPanel().show();
  }

  _continue() {
    // TODO(jeffreytan): when we figured out the launch lifecycle story
    // we may bind this to start-debugging too.
    this._model.getBridge().continue();
  }

  _stop() {
    this._model.getActions().killDebugger();
  }

  _stepOver() {
    this._model.getBridge().stepOver();
  }

  _stepInto() {
    this._model.getBridge().stepInto();
  }

  _stepOut() {
    this._model.getBridge().stepOut();
  }

  @trackTiming('nuclide-debugger-atom:toggleBreakpoint')
  _toggleBreakpoint() {
    const editor = atom.workspace.getActiveTextEditor();
    if (editor && editor.getPath()) {
      const filePath = editor.getPath();
      if (filePath) {
        const line = editor.getLastCursor().getBufferRow();
        this.getModel().getBreakpointStore().toggleBreakpoint(filePath, line);
      }
    }
  }


  _toggleLaunchAttachDialog(): void {
    const dialog = this._getLaunchAttachDialog();
    if (dialog.isVisible()) {
      dialog.hide();
    } else {
      dialog.show();
    }
  }

  _hideLaunchAttachDialog(): void {
    const dialog = this._getLaunchAttachDialog();
    if (dialog.isVisible()) {
      dialog.hide();
    }
  }

  _getLaunchAttachDialog(): atom$Panel {
    if (!this._launchAttachDialog) {
      const component = (
        <DebuggerLaunchAttachUI
          store={this._model.getDebuggerProviderStore()}
          debuggerActions={this._model.getActions()}
        />
      );
      const host = document.createElement('div');
      ReactDOM.render(component, host);
      this._launchAttachDialog = atom.workspace.addModalPanel({
        item: host,
        visible: false, // Hide first so that caller can toggle it visible.
      });

      this._disposables.add(
        new Disposable(() => {
          if (this._launchAttachDialog != null) {
            this._launchAttachDialog.destroy();
            this._launchAttachDialog = null;
          }
        }),
        atom.commands.add(
          'atom-workspace',
          'core:cancel',
          this._hideLaunchAttachDialog,
        ),
      );
    }
    invariant(this._launchAttachDialog);
    return this._launchAttachDialog;
  }

  /**
   * Lazy panel creation.
   */
  _getPanel(): Object {
    if (!this._panel) {
      const panel = atom.workspace.addRightPanel({
        item: this._model,
        visible: false,
      });
      // Flow doesn't track non-null when assigning into nullable directly.
      this._panel = panel;
      return panel;
    } else {
      return this._panel;
    }
  }
}

let activation = null;
let toolBar: ?any = null;

module.exports = {
  activate(state: ?SerializedState) {
    if (!activation) {
      activation = new Activation(state);
    }
  },

  serialize(): SerializedState {
    if (activation) {
      return activation.serialize();
    } else {
      return {
        breakpoints: null,
      };
    }
  },

  deactivate() {
    if (activation) {
      activation.dispose();
      activation = null;
    }
    if (toolBar) {
      toolBar.removeItems();
    }
  },

  consumeNuclideDebugger(service: nuclide_debugger$Service): Disposable {
    if (activation) {
      activation.getModel().getActions().addService(service);
    }
    return new Disposable(() => {
      if (activation) {
        activation.getModel().getActions().removeService(service);
      }
    });
  },

  consumeDebuggerProvider(
    provider: NuclideDebuggerProvider
  ): IDisposable {
    if (activation) {
      activation.getModel().getActions().addDebuggerProvider(provider);
    }
    return new Disposable(() => {
      if (activation) {
        activation.getModel().getActions().removeDebuggerProvider(provider);
      }
    });
  },

  DebuggerProcessInfo: require('./DebuggerProcessInfo'),
  DebuggerInstance: require('./DebuggerInstance'),
  DebuggerLaunchAttachProvider: require('./DebuggerLaunchAttachProvider'),

  consumeToolBar(getToolBar: (group: string) => Object): void {
    toolBar = getToolBar('nuclide-debugger');
    toolBar.addButton({
      icon: 'plug',
      callback: 'nuclide-debugger:toggle',
      tooltip: 'Toggle Debugger',
      priority: 100,
    });
  },

  provideRemoteControlService(): RemoteControlService {
    return new RemoteControlService(() => activation ? activation.getModel() : null);
  },
};
