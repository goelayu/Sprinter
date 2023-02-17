/**
 * A new puppeteer concurrency model which is a hybrid of browser and page
 * opens a new browser for every worker instance
 * however only creates a new page within each browser for every job (URL)
 * 
 */


import * as puppeteer from 'puppeteer';

import { debugGenerator, timeoutExecute } from '/vault-swift/goelayu/balanced-crawler/system/node/node_modules/puppeteer-cluster/dist/util';
import ConcurrencyImplementation, { WorkerInstance } from '/vault-swift/goelayu/balanced-crawler/system/node/node_modules/puppeteer-cluster/dist/concurrency/ConcurrencyImplementation';
const debug = debugGenerator('BrowserConcurrency');

const BROWSER_TIMEOUT = 5000;

export default class BrowserPage extends ConcurrencyImplementation {
    public async init() {}
    public async close() {}

    public async workerInstance(perBrowserOptions: puppeteer.LaunchOptions | undefined):
        Promise<WorkerInstance> {

        const options = perBrowserOptions || this.options;
        let chrome = await this.puppeteer.launch(options) as puppeteer.Browser;
        let context = await chrome.createIncognitoBrowserContext() as puppeteer.BrowserContext;
        let page = await context.newPage() as puppeteer.Page;

        return {
            jobInstance: async () => {
                await timeoutExecute(BROWSER_TIMEOUT, (async () => {
                    page = await context.newPage();
                })());

                return {
                    resources: {
                        page,
                    },

                    close: async () => {
                        await timeoutExecute(BROWSER_TIMEOUT, page.close());
                    },
                };
            },

            close: async () => {
                await chrome.close();
            },

            repair: async () => {
                debug('Starting repair');
                try {
                    // will probably fail, but just in case the repair was not necessary
                    await chrome.close();
                } catch (e) {}

                // just relaunch as there is only one page per browser
                chrome = await this.puppeteer.launch(options);
            },
        };
    }

}

