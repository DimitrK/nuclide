'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import BreakpointManager from '../lib/BreakpointManager.js';
import BreakpointStore from '../lib/BreakpointStore.js';
import {hasBreakpointDecorationInRow} from './utils';
import utils from './utils';
import invariant from 'assert';

describe('BreakpointManager', () => {
  let breakpointManager;
  let breakpointStore;

  beforeEach(() => {
    breakpointStore = new BreakpointStore();
    breakpointManager = new BreakpointManager(breakpointStore);
  });

  it('should display existing breakpoints in editor when it is opened', () => {
    waitsForPromise(async () => {
      const path = utils.getUniquePath();
      breakpointStore.addBreakpoint(path, 0);
      const editor = await atom.workspace.open(path);
      expect(hasBreakpointDecorationInRow(editor, 0)).toBe(true);
    });
  });

  it('should clean up breakpoint display for an editor when the editor is closed', () => {
    waitsForPromise(async () => {
      const uniqueEditor = await utils.createEditorWithUniquePath();
      const path = uniqueEditor.getPath();
      invariant(path);
      breakpointStore.addBreakpoint(path, 1);
      const editor = await atom.workspace.open(path);
      expect(hasBreakpointDecorationInRow(editor, 0)).toBe(true);
      expect(breakpointManager.getDisplayControllers().size).toBe(1);

      const pane = atom.workspace.paneForItem(editor);
      invariant(pane != null);
      pane.destroyItem(editor);
      expect(breakpointManager.getDisplayControllers().size).toBe(0);

      // But the store should still remember the breakpoint
      expect(breakpointStore.getBreakpointsForPath(path)).toEqual(new Set([1]));
    });
  });
});
