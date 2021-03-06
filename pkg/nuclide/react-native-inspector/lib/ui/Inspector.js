'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Gadget} from '../../../gadgets-interfaces';
import {React} from 'react-for-atom';
import path from 'path';
import Webview from '../../../ui/webview';
import {toJsString} from '../../../commons';

class Inspector extends React.Component {
  static gadgetId = 'nuclide-react-native-inspector';

  constructor(props: mixed) {
    super(props);
    (this: any)._handleDidFinishLoad = this._handleDidFinishLoad.bind(this);
  }

  getTitle(): string {
    return 'React Native Inspector';
  }

  render(): ?ReactElement {
    return (
      <Webview
        style={{width: '100%', height: '100%'}}
        nodeintegration={true}
        className="native-key-bindings"
        onDidFinishLoad={this._handleDidFinishLoad}
        src="atom://nuclide/pkg/nuclide/react-native-inspector/lib/ui/inspector.html"
      />
    );
  }

  _handleDidFinishLoad(event) {
    const element = ((event.target: any): WebviewElement);
    const packageDirectory = path.resolve(__dirname, '../../');
    const requirePaths = require.cache[__filename].paths;
    element.executeJavaScript(
      `initializeElementInspector(${toJsString(packageDirectory)}, ${toJsString(requirePaths)});`
    );
  }
}

module.exports = ((Inspector: any): Gadget);
