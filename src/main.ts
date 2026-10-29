import './styles.css';
import { EditorStore } from './editor/store';
import { StudioApp } from './app';
import { mountShell } from './ui/shell';
import { h } from './ui/dom';
import { diagnosticDoc } from './diagnostics/scene';
import { installTestApi } from './testing';

const root = document.getElementById('app')!;
const canvas = h('canvas', { id: 'cv', 'aria-label': '3D composition' });
const viewport = h('section', { id: 'vp' }, canvas);

// Until the scanned-asset pipeline lands (M2) the default project is the diagnostic studio.
const store = new EditorStore(diagnosticDoc());
const app = new StudioApp(canvas, viewport, store);
const shell = mountShell(root, app, viewport);
app.resize();
shell.refresh();
installTestApi(app, store, shell);
