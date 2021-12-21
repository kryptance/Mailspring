import aesjs from 'aes-js';
import {DefaultEventsMap} from "@socket.io/component-emitter";
import {Socket} from "socket.io-client";
import {range} from "underscore";

export function fromHex(hexString: string) {
    return Buffer.from(hexString, 'hex');
}

export function subscribe(socket: Socket<DefaultEventsMap, DefaultEventsMap>, topic: SubscriptionTopic,
                          getKey: () => string,
                          listener: (messageData: any) => void) {

    // TODO: this will be a problem if user changes key
    hash(getKey()).then(address => {
        socket.send({
            topic: 'subscribe',
            destination: address,
            body: {destination: address, topic: topic} as Subscription
        } as SocketMessage)
    })

    socket.on("message", dataRaw => {
        const message = dataRaw as SocketMessage
        if(message.topic === topic) {
            const currentKey = getKey()

            const key = new Uint8Array(aesjs.utils.hex.toBytes(currentKey))

            const encrypted = message.body as EncryptedObject
            listener(decrypt(encrypted, key))
        }
    });
}

export function sendMessage(socket: Socket<DefaultEventsMap, DefaultEventsMap>, key: string, topic: SubscriptionTopic, object: any) {
    const body = encrypt(object, fromHex(key))
    hash(key).then(address => {
        address && socket.send({body: body, topic: topic, destination: address} as SocketMessage)
    })
}

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
    topic: 'subscribe' | SubscriptionTopic,
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
