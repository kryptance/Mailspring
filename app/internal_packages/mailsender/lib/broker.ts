import aesjs from 'aes-js';
import {io, Socket} from "socket.io-client";
import {range} from "underscore";

export function fromHex(hexString: string) {
    return Buffer.from(hexString, 'hex');
}

export class Broker {
    socket: Socket
    fnConnect: () => void

    constructor() {
    }

    onConnect(fn: () => void) {
        this.fnConnect = fn
    }

    connect() {
        if(this.socket) {
            this.socket.close()
        }
        this.socket = io("wss://broker.befundbote.de", {transports: ['websocket']})

        this.socket.on("connect_error", (err) => {
            console.log("CONNECTION ERROR")
            console.log(err.stack)
            setTimeout(() => {
                this.socket.connect();
            }, 10000);
        })

        this.socket.on("reconnect_failed", () => {
            this.connect()
        })

        this.socket.on("disconnect", () => {
            this.connect()
        });

        this.fnConnect && this.fnConnect()
    }

    subscribe(topic: SubscriptionTopic,
              getKey: () => string,
              listener: (messageData: any) => void) {
        // TODO: this will be a problem if user changes key
        let key = getKey()

        hash(key).then(address => {
            this.socket.send({
                topic: 'subscribe',
                destination: address,
                body: {destination: address, topic: topic} as Subscription
            } as SocketMessage)
        })
        this.socket.on("message", dataRaw => {
            const message = dataRaw as SocketMessage
            if(message.topic === topic) {
                const key = new Uint8Array(aesjs.utils.hex.toBytes(getKey()))
                const encrypted = message.body as EncryptedObject
                listener(decrypt(encrypted, key))
            }
        });
    }

    sendMessage(key: string, topic: SubscriptionTopic, object: any) {
        const body = encrypt(object, fromHex(key))
        hash(key).then(address => {
            address && this.socket.send({body: body, topic: topic, destination: address} as SocketMessage)
        })
    }

    close() {
        this.socket.close()
    }

}

export const broker = new Broker()

export function hash(string) {
    const utf8 = new TextEncoder().encode(string);
    return crypto.subtle.digest('SHA-256', utf8).then((hashBuffer) => {
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray
            .map((bytes) => bytes.toString(16).padStart(2, '0'))
            .join('');
        return hashHex;
    });
}

function encrypt(value: any, key: Uint8Array): EncryptedObject {

    const iv = randomBytes(16)

    const text = JSON.stringify(value);
    const textBytes = aesjs.utils.utf8.toBytes(text) as Uint8Array

    const padding = 16 - (textBytes.length % 16)

    const result = new Uint8Array([...textBytes, ...range(0, padding).map(() => { return 0})])

    const aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
    const encryptedBytes = aesCbc.encrypt(result);

    return {
        iv: aesjs.utils.hex.fromBytes(iv),
        encrypted: aesjs.utils.hex.fromBytes(encryptedBytes)
    }
}

export function decrypt(value: EncryptedObject, key: Uint8Array): any {
    const aesCbc = new aesjs.ModeOfOperation.cbc(key, aesjs.utils.hex.toBytes(value.iv));
    const decryptedBytes = aesCbc.decrypt(aesjs.utils.hex.toBytes(value.encrypted));
    const paddingIdx = decryptedBytes.indexOf(0)

    return JSON.parse(aesjs.utils.utf8.fromBytes(decryptedBytes.subarray(0, paddingIdx)))
}


export function randomBytes(size: number) {
    const random = new Uint8Array(size)
    crypto.getRandomValues(random)
    return new Buffer(random)
}

export type SocketMessage = {
    topic: 'subscribe' | 'unsubscribe' | SubscriptionTopic,
    destination?: string,
    body: any
}

export type EncryptedObject = {
    iv: string,
    encrypted: string,
}

export type SubscriptionTopic = 'email' | 'email-sent' | 'email-queued'

export type Subscription = {
    destination: string,
    topic: SubscriptionTopic
}
