import crypto from "crypto";
import eccCrypto, {Ecies} from 'eccrypto'
import pbkdf2 from 'pbkdf2'
import * as bitcoin from 'bitcoinjs-lib'
import axios, {AxiosResponse} from "axios";
import {Base64} from 'js-base64'

export function toHex(buffer: ArrayBufferLike) {
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

export interface ChannelMessage {
    channelId: string;
    message: EncryptedMessageInput;
    organization: any;
    stamp: number;
    messageId?: string
}

export async function signWithHash(signerKey: Buffer, data: string): Promise<Signature> {
    const messageHash = crypto.createHash("sha256").update(data).digest()
    const publicKey = eccCrypto.getPublic(signerKey);
    const signatureValue = await eccCrypto.sign(signerKey, messageHash)
    return {
        value: signatureValue,
        publicKey: Base64.fromUint8Array(publicKey)
    }
}

export class EngineError implements Error {
    constructor(message: string) {
        this.message = message
        this.name = 'EngineError'
    }

    message: string;
    name: string;
}

export interface Signature {
    value: Buffer
    publicKey: string
}

export function serializeSignature(signature: Signature): SignatureInput {
    return {
        value: Base64.fromUint8Array(signature.value),
        publicKey: signature.publicKey
    }
}

export function serializeEcies(ecies: Ecies) {
    return [
        toHex(ecies.iv),
        toHex(ecies.ephemPublicKey),
        toHex(ecies.ciphertext),
        toHex(ecies.mac)
    ].join('.')
}

export interface SignatureInput {
    value: string;
    publicKey: string;
}

export interface SerializedCertificate {
    serializedIssue: string;
    signature: SignatureInput;
    signatureStamp: number;
}

export interface EncryptedMessageInput {
    address: string;
    data: string;
    certificate?: SerializedCertificate;
    signature: SignatureInput;
    annotations?: { [key: string]: string };
    annotationsSignature?: SignatureInput;
}

function createMessageSubmitter<T>(endpoint: string): (code: string) => { send: (data: T) => Promise<ChannelMessage> } {
    const submitter: (code: string) => {
        send: (data: T) => Promise<ChannelMessage>
    } = (code) => {
        const privateKey = pbkdf2.pbkdf2Sync(code, '', 10 * 1000, 32)
        const publicKey = eccCrypto.getPublic(privateKey)
        const address = bitcoin.payments.p2pkh({pubkey: publicKey})

        async function submit(data: T) {
            if (address.address) {
                const jsonString = JSON.stringify(data)
                const encrypted = await eccCrypto.encrypt(publicKey, Buffer.from(jsonString))
                const serialized = serializeEcies(encrypted)
                const signature = await signWithHash(privateKey, serialized)

                const message: EncryptedMessageInput = {
                    address: address.address,
                    signature: serializeSignature(signature),
                    data: serialized
                }

                const response = await axios.post<any, AxiosResponse<ChannelMessage>>(`http://192.168.178.53:8080/api/${endpoint}`, message);
                return response.data
            } else {
                throw new EngineError("Could not create address from public key")
            }
        }

        return {
            send: async (data: T) => {
                return await submit(data)
            }
        }
    }
    return submitter
}

export type EmailSentData = {
    befundboteCode: string,
    emailTo: string,
    emailFrom: string,
    stampSent: number
}

export const createEmailSentSubmitter = createMessageSubmitter<EmailSentData>('email')
