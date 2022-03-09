import * as React from 'react';
import {SendDraftTask} from "../../../src/flux/tasks/send-draft-task";
import {
    Actions,
    ComponentRegistry,
    DraftFactory,
    Message,
    ModalStore,
    SignatureStore,
    WorkspaceStore
} from "mailspring-exports";
import {Composer as ComposerExtensionRegistry} from "../../../src/registries/extension-registry";

import {broker} from "./broker";
import {EmailContact, EmailData, EmailQueuedData} from "./messages";
import {Contact} from "../../../src/flux/models/contact";
import {createEmailSentSubmitter} from "./befundbote";

export function createContact(email: EmailContact) {
    return new Contact({name: email.name, email: email.email})
}

function reconnect() {
    let key = getKeyFromStorage();
    console.log("RECONNECTING... KEY IS: " + key)
    if (!key) {
        broker.close()
    } else {
        broker.connect()
    }
}

class TokenForm extends React.Component<{}, { cryptoKey: string, savedCryptoKey: string, valueChanged: boolean }> {

    constructor(props) {
        super(props)
        console.log("SETTING STATE")
        this.state = {
            savedCryptoKey: localStorage.getItem("cryptoKey"),
            cryptoKey: localStorage.getItem("cryptoKey"),
            valueChanged: false
        };
    }

    render() {
        return <div style={{height: '200px', width: '340px'}}>
            <p style={{margin: '10px'}}>Bitte Schlüssel generieren unter "Labor -&gt; Verwaltung -&gt; E-Mail" und hier
                einfügen.</p>
            <div style={{marginLeft: '20px', width: '300px'}}>
                <p>Aktueller Wert:</p>
                <p>{this.state.savedCryptoKey || '-leer-'}</p>
                <input value={this.state.cryptoKey}
                       onChange={event => this.setState({...this.state, cryptoKey: event.target.value})}
                       type='text'/><br/>
                <button onClick={event => {
                    this.setState({savedCryptoKey: '', cryptoKey: ''})
                    localStorage.setItem("cryptoKey", '')
                    reconnect()
                }}>löschen
                </button>
                <button onClick={event => {
                    this.setState({...this.state,
                        savedCryptoKey: this.state.cryptoKey,
                        valueChanged: true})
                    localStorage.setItem("cryptoKey", this.state.cryptoKey)
                    reconnect()
                }}>übernehmen
                </button>
                {this.state.valueChanged && <p>Verbindung hergestellt!</p>}
            </div>
        </div>
    }
}

export default class MailSenderStatusButton extends React.Component {
    static displayName = 'MailSenderStatusButton';

    _onNewCompose = () => {
        ModalStore.renderModal(<TokenForm/>, {}, () => {
        })
    };

    render() {
        return (
            <button
                className="btn btn-toolbar item-compose"
                title="befundbote"
                onClick={this._onNewCompose}
            >befundbote</button>
        );
    }
}

const codeCache = new Map<string, string>()

function getKeyFromStorage() {
    return localStorage.getItem("cryptoKey")
}

function sendEmail(data: EmailData) {
    let signatureId = SignatureStore.getDefaults()[DraftFactory._accountForNewDraft().emailAddress]
    if(!signatureId) {
        signatureId = SignatureStore.selectedSignatureId
    }
    const signature = signatureId && SignatureStore.signatures[signatureId]

    DraftFactory.createDraft({
        subject: data.subject,
        to: data.to.map(createContact),
        cc: data.cc.map(createContact),
        bcc: data.bcc.map(createContact),
        replyTo: data.replyTo.map(createContact),
        body: data.body + (signature && signature.body)
    }).then(draft => {
        const task = SendDraftTask.forSending(draft);
        Actions.queueTask(task)
        codeCache.set(draft.headerMessageId, data.befundboteCode)
        console.log(codeCache.keys())
        broker.sendMessage(getKeyFromStorage(), "email-queued", {
            befundboteCode: data.befundboteCode,
            emailId: draft.headerMessageId
        } as EmailQueuedData)
    })
}

export function activate() {

    ComponentRegistry.register(MailSenderStatusButton, {
        location: WorkspaceStore.Location.RootSidebar.Toolbar,
    });

    ComposerExtensionRegistry.register({
        name: 'mailsender',
        onSendSuccess: (draft: Message) => {
            const currentKey = getKeyFromStorage()
            console.log(draft)

            const befundboteCode = codeCache.get(draft.headerMessageId)
            const emailSentData = {
                befundboteCode: befundboteCode,
                emailTo: draft.to[0].email,
                emailFrom: draft.from[0].email,
                stampSent: Math.floor(Date.now() / 1000)
            }

            broker.sendMessage(currentKey, "email-sent", emailSentData)

            if (befundboteCode) {
                createEmailSentSubmitter(befundboteCode).send(emailSentData)
            }
        }
    })

    broker.onConnect(() => {
        console.log("CONNECTED.....")
        if (getKeyFromStorage()) {
            console.log("SUBSCRIBING TO ..... " + getKeyFromStorage())
            broker.subscribe("email", getKeyFromStorage, sendEmail)
        }
    })

    broker.connect()
}

export function deactivate() {
    console.log("closing socket")
    broker.close()
}
