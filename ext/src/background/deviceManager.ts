"use strict";

import bridge from "../lib/bridge";
import logger from "../lib/logger";
import { TypedEventTarget } from "../lib/TypedEventTarget";

import { Message, Port } from "../messaging";
import { ReceiverDevice } from "../types";
import { ReceiverStatus } from "../cast/sdk/types";

interface EventMap {
    receiverDeviceUp: { deviceInfo: ReceiverDevice };
    receiverDeviceDown: { deviceId: string };
    receiverDeviceUpdated: {
        deviceId: string;
        status: ReceiverStatus;
    };
}

export default new (class extends TypedEventTarget<EventMap> {
    /**
     * Map of receiver device IDs to devices. Updated as
     * receiverDevice messages are received from the bridge.
     */
    private receiverDevices = new Map<string, ReceiverDevice>();

    private bridgePort?: Port;
    async init() {
        if (!this.bridgePort) {
            await this.refresh();
        }
    }

    /**
     * Initialize (or re-initialize) a bridge connection to
     * start dispatching events.
     */
    async refresh() {
        this.bridgePort?.disconnect();
        this.receiverDevices.clear();

        this.bridgePort = await bridge.connect();
        this.bridgePort.onMessage.addListener(this.onBridgeMessage);
        this.bridgePort.onDisconnect.addListener(this.onBridgeDisconnect);

        this.bridgePort.postMessage({
            subject: "bridge:startDiscovery",
            data: {
                // Also send back status messages
                shouldWatchStatus: true
            }
        });
    }

    /**
     * Get a list of receiver devices
     */
    getDevices() {
        return Array.from(this.receiverDevices.values());
    }

    /**
     * Stops a receiver app running on a given device.
     */
    stopReceiverApp(receiverDeviceId: string) {
        if (!this.bridgePort) {
            logger.error(
                "Failed to stop receiver device, no bridge connection"
            );
            return;
        }

        const receiverDevice = this.receiverDevices.get(receiverDeviceId);
        if (receiverDevice) {
            this.bridgePort.postMessage({
                subject: "bridge:stopCastSession",
                data: { receiverDevice }
            });
        }
    }

    private onBridgeMessage = (message: Message) => {
        switch (message.subject) {
            case "main:receiverDeviceUp": {
                const { deviceId, deviceInfo } = message.data;

                this.receiverDevices.set(deviceId, deviceInfo);
                this.dispatchEvent(
                    new CustomEvent("receiverDeviceUp", {
                        detail: { deviceInfo }
                    })
                );

                break;
            }

            case "main:receiverDeviceDown": {
                const { deviceId } = message.data;

                if (this.receiverDevices.has(deviceId)) {
                    this.receiverDevices.delete(deviceId);
                }
                this.dispatchEvent(
                    new CustomEvent("receiverDeviceDown", {
                        detail: { deviceId: deviceId }
                    })
                );

                break;
            }

            case "main:receiverDeviceStatusUpdated": {
                const { deviceId, status } = message.data;
                const receiverDevice = this.receiverDevices.get(deviceId);
                if (!receiverDevice) {
                    break;
                }

                if (receiverDevice.status) {
                    receiverDevice.status.isActiveInput = status.isActiveInput;
                    receiverDevice.status.isStandBy = status.isStandBy;
                    receiverDevice.status.volume = status.volume;

                    if (status.applications) {
                        receiverDevice.status.applications =
                            status.applications;
                    }
                } else {
                    receiverDevice.status = status;
                }

                this.dispatchEvent(
                    new CustomEvent("receiverDeviceUpdated", {
                        detail: {
                            deviceId,
                            status: receiverDevice.status
                        }
                    })
                );

                break;
            }

            case "main:receiverDeviceMediaStatusUpdated": {
                break;
            }
        }
    };

    private onBridgeDisconnect = () => {
        // Notify listeners of device availablility
        for (const [, receiverDevice] of this.receiverDevices) {
            const event = new CustomEvent("receiverDeviceDown", {
                detail: { deviceId: receiverDevice.id }
            });

            this.dispatchEvent(event);
        }

        this.receiverDevices.clear();

        // Re-initialize after 10 seconds
        window.setTimeout(() => {
            this.refresh();
        }, 10000);
    };
})();
