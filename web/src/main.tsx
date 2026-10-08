import '@fontsource/dela-gothic-one/latin-400.css';
import '@fontsource/dela-gothic-one/latin-ext-400.css';
import '@fontsource-variable/figtree/index.css';
import { render } from 'preact';
import { api } from './api.ts';
import { App } from './App.tsx';
import { startAuthStateRequest } from './auth/early-state.ts';
import { initialLang } from './i18n/index.tsx';
import { warmUpForReturningPerson } from './shell-loader.ts';
import './styles/tokens.css';
import './styles/app.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element in index.html');
const lang = initialLang();
startAuthStateRequest(api.auth.state, lang);
warmUpForReturningPerson(lang);
render(<App />, root);
