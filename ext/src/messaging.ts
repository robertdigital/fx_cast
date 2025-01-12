"use strict";

import { TypedPort } from "./lib/TypedPort";
import { BridgeInfo } from "./lib/bridge";

import {
    ReceiverSelection,
    ReceiverSelectionCast,
    ReceiverSelectionStop
} from "./background/receiverSelector";

import {
    CastSessionCreatedDetails,
    CastSessionUpdatedDetails,
    MediaStatus,
    ReceiverStatus,
    SenderMessage
} from "./cast/sdk/types";
import { SessionRequest } from "./cast/sdk/classes";

import { ReceiverDevice, ReceiverSelectorMediaType } from "./types";

/**
 * Messages are JSON objects with a `subject` string key and a
 * generic `data` key:
 *   { subject: "...", data: ... }
 *
 * Message subjects may include an optional destination and
 * response name formatted like this:
 *   ^(destination:)?messageName(\/responseName)?$
 *
 * Message formats are specified with subject as a key and data
 * as the value in the message tables.
 */

/**
 * Messages exclusively used internally between extension
 * components.
 */
type ExtMessageDefinitions = {
    "popup:init": {
        appId?: string;
        pageInfo?: {
            url: string;
            tabId: number;
            frameId: number;
        };
    };
    "popup:update": {
        receiverDevices: ReceiverDevice[];
        defaultMediaType?: ReceiverSelectorMediaType;
        availableMediaTypes?: ReceiverSelectorMediaType;
    };
    "popup:close": undefined;

    "receiverSelector:selected": ReceiverSelection;
    "receiverSelector:stop": ReceiverSelection;

    "main:selectReceiver": {
        sessionRequest: SessionRequest;
    };
    "cast:selectReceiver/selected": ReceiverSelectionCast;
    "cast:selectReceiver/stopped": ReceiverSelectionStop;
    "cast:selectReceiver/cancelled": undefined;

    "main:closeReceiverSelector": undefined;

    "main:initializeCast": { appId: string };
    "cast:initialized": BridgeInfo;

    "cast:receiverDeviceUp": { receiverDevice: ReceiverDevice };
    "cast:receiverDeviceDown": { receiverDeviceId: ReceiverDevice["id"] };
    "cast:launchApp": { receiverDevice: ReceiverDevice };
};

/**
 * IMPORTANT:
 * Messages that cross the native messaging channel. MUST keep
 * in-sync with the bridge's version at:
 *   app/src/bridge/messaging.ts > MessageDefinitions
 */
type AppMessageDefinitions = {
    /**
     * First message sent by the extension to the bridge.
     * Includes extension version string. Responds directly with version
     * string of the bridge to compare.
     *
     * Still uses `:/` message separator for compat talking to older
     * bridge versions.
     */
    "bridge:getInfo": string;
    "bridge:/getInfo": string;

    /**
     * Tells a bridge to begin service discovery (and whether to
     * establish connections to monitor the status of the receiver
     * devices).
     */
    "bridge:startDiscovery": {
        shouldWatchStatus: boolean;
    };

    /**
     * Sent to extension from the bridge whenever a receiver device is
     * found.
     */
    "main:receiverDeviceUp": { deviceId: string; deviceInfo: ReceiverDevice };
    /**
     * Sent to extension from the bridge whenever a previously found
     * receiver device is lost.
     */
    "main:receiverDeviceDown": { deviceId: string };

    /**
     * Sent to the extension from the bridge whenever a
     * `RECEIVER_STATUS` message (`NS_RECEIVER`) is received.
     */
    "main:receiverDeviceStatusUpdated": {
        deviceId: string;
        status: ReceiverStatus;
    };
    /**
     * Sent to the extension from the bridge whenever a
     * `MEDIA_STATUS` message (`NS_RECEIVER`) is received.
     */
    "main:receiverDeviceMediaStatusUpdated": {
        deviceId: string;
        status: MediaStatus;
    };

    /**
     * Sent to bridge from cast API instance when a session request is
     * initiated.
     */
    "bridge:createCastSession": {
        appId: string;
        receiverDevice: ReceiverDevice;
    };
    /**
     * Connects to, and sends a `STOP` message on the `NS_RECEIVER`
     * channel for the given receiver device.
     */
    "bridge:stopCastSession": {
        receiverDevice: ReceiverDevice;
    };

    /**
     * Sent to cast API instances whenever a session is created or
     * updates. Updated details is a mutable subset of session details
     * otherwise fixed on creation.
     */
    "cast:sessionCreated": CastSessionCreatedDetails;
    "cast:sessionUpdated": CastSessionUpdatedDetails;
    /**
     * Sent to cast API instances whenever a session is stopped.
     */
    "cast:sessionStopped": {
        sessionId: string;
    };

    /**
     * Sent to bridge from cast API instance whenever an `NS_RECEIVER`
     * message needs to be sent.
     */
    "bridge:sendCastReceiverMessage": {
        sessionId: string;
        messageData: SenderMessage;
        messageId: string;
    };

    /**
     * Sent to bridge from cast API instance whenever a application
     * session message needs to be sent (via
     * `chrome.cast.Session#sendMessage`).
     */
    "bridge:sendCastSessionMessage": {
        sessionId: string;
        namespace: string;
        messageData: object | string;
        messageId: string;
    };
    /**
     * Sent to cast API instance from bridge when session message
     * received from a receiver device.
     */
    "cast:receivedSessionMessage": {
        sessionId: string;
        namespace: string;
        messageData: string;
    };

    /**
     * Sent to cast API instance from bridge whenever a message
     * operation is completed. If an error ocurred, an error string will
     * be passed as the `error` data property.
     */
    "cast:impl_sendMessage": {
        sessionId: string;
        messageId: string;
        error?: string;
    };

    /**
     * Sent to the bridge to start an HTTP media server at a given file
     * path on the given port.
     */
    "bridge:startMediaServer": {
        filePath: string;
        port: number;
    };
    /**
     * Sent to media sender from bridge when the media server is ready
     * to serve files.
     */
    "mediaCast:mediaServerStarted": {
        mediaPath: string;
        subtitlePaths: string[];
        localAddress: string;
    };
    /**
     * Sent to bridge to stop HTTP media server.
     */
    "bridge:stopMediaServer": undefined;
    /**
     * Sent to media sender from bridge when the media server has
     * stopped.
     */
    "mediaCast:mediaServerStopped": undefined;
    /**
     * Sent to media sender from bridge when the media server has
     * encountered an error.
     */
    "mediaCast:mediaServerError": string;
};

type MessageDefinitions = ExtMessageDefinitions & AppMessageDefinitions;

interface MessageBase<K extends keyof MessageDefinitions> {
    subject: K;
    data: MessageDefinitions[K];
}

type Messages = {
    [K in keyof MessageDefinitions]: MessageBase<K>;
};

/**
 * Make message data key optional if specified as blank or with
 * all-optional keys.
 */
type NarrowedMessage<L extends MessageBase<keyof MessageDefinitions>> =
    L extends unknown
        ? undefined extends L["data"]
            ? Omit<L, "data"> & Partial<L>
            : L
        : never;

export type Port = TypedPort<Message>;
export type Message = NarrowedMessage<Messages[keyof Messages]>;

/**
 * Typed WebExtension-style messaging utility class.
 */
export default new (class Messenger {
    connect(connectInfo: { name: string }) {
        return browser.runtime.connect(connectInfo) as Port;
    }

    connectTab(tabId: number, connectInfo: { name: string; frameId: number }) {
        return browser.tabs.connect(tabId, connectInfo) as Port;
    }

    onConnect = {
        addListener(cb: (port: Port) => void) {
            browser.runtime.onConnect.addListener(
                cb as (port: browser.runtime.Port) => void
            );
        },
        removeListener(cb: (port: Port) => void) {
            browser.runtime.onConnect.removeListener(
                cb as (port: browser.runtime.Port) => void
            );
        },
        hasListener(cb: (port: Port) => void) {
            return browser.runtime.onConnect.hasListener(
                cb as (port: browser.runtime.Port) => void
            );
        }
    };
})();
