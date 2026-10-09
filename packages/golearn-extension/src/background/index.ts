import { getChrome } from '../platform';
import { createBackground } from './core';

const chromeApi = getChrome();
if (chromeApi) createBackground(chromeApi).register();
