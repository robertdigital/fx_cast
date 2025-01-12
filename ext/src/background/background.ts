"use strict";

import defaultOptions from "../defaultOptions";
import logger from "../lib/logger";
import options from "../lib/options";
import bridge, { BridgeInfo } from "../lib/bridge";

import castManager from "./castManager";
import deviceManager from "./deviceManager";
import selectorManager from "./selectorManager";

import { initMenus } from "./menus";
import { initWhitelist } from "./whitelist";

const _ = browser.i18n.getMessage;

/**
 * On install, set the default options before initializing the
 * extension. On update, handle any unset values and set to the new
 * defaults.
 */
browser.runtime.onInstalled.addListener(async details => {
    switch (details.reason) {
        case "install": {
            // Set defaults
            await options.setAll(defaultOptions);

            // Extension initialization
            init();
            break;
        }

        case "update": {
            // Set new defaults
            await options.update(defaultOptions);
            break;
        }
    }
});

/**
 * Checks whether the bridge can be reached and is compatible with the
 * current version of the extension. If not, triggers a notification
 * with the appropriate info.
 */
async function notifyBridgeCompat() {
    logger.info("checking for bridge...");

    let info: BridgeInfo;
    try {
        info = await bridge.getInfo();
    } catch (err) {
        logger.info("... bridge issue!");
        return;
    }

    if (info.isVersionCompatible) {
        logger.info("... bridge compatible!");
    } else {
        logger.info("... bridge incompatible!");

        const updateNotificationId = await browser.notifications.create({
            type: "basic",
            title: `${_("extensionName")} — ${_(
                "optionsBridgeIssueStatusTitle"
            )}`,
            message: info.isVersionOlder
                ? _("optionsBridgeOlderAction")
                : _("optionsBridgeNewerAction")
        });

        browser.notifications.onClicked.addListener(notificationId => {
            if (notificationId !== updateNotificationId) {
                return;
            }

            browser.tabs.create({
                url: `https://github.com/hensm/fx_cast/releases/tag/v${info.expectedVersion}`
            });
        });
    }
}

let isInitialized = false;

async function init() {
    if (isInitialized) {
        return;
    }

    /**
     * If options haven't been set yet, we can't properly initialize,
     * so wait until init is called again in the onInstalled listener.
     */
    if (!(await options.getAll())) {
        return;
    }

    logger.info("init");
    isInitialized = true;

    await notifyBridgeCompat();

    await deviceManager.init();
    await castManager.init();

    await initMenus();
    await initWhitelist();

    /**
     * When the browser action is clicked, open a receiver selector and
     * load a sender for the response. The mirroring sender is loaded
     * into the current tab at the
     * top-level frame.
     */
    browser.browserAction.onClicked.addListener(async tab => {
        if (tab.id === undefined) {
            logger.error("Tab ID not found in browser action handler.");
            return;
        }

        const selection = await selectorManager.getSelection(tab.id);
        if (selection) {
            castManager.loadSender({
                tabId: tab.id,
                frameId: 0,
                selection
            });
        }
    });
}

init();
