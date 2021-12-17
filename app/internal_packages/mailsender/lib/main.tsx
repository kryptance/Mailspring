import * as React from 'react';
import {SendDraftTask} from "../../../src/flux/tasks/send-draft-task";
import {Actions, ComponentRegistry, DraftFactory, ModalStore, WorkspaceStore} from "mailspring-exports";
import {io} from "socket.io-client";
import {Composer as ComposerExtensionRegistry} from "../../../src/registries/extension-registry";

import {sendMessage, subscribe} from "./broker";
import {EmailContact, EmailData, EmailQueuedData, EmailSentData} from "./messages";
import {Contact} from "../../../src/flux/models/contact";

export function createContact(email: EmailContact) {
    return new Contact({name: email.name, email: email.email})
}

export default class MailSenderStatusButton extends React.Component<{}, {cryptoKey: string}> {
    static displayName = 'MailSenderStatusButton';

    constructor(props) {
        super(props)
        this.state = {
            cryptoKey: localStorage.getItem("cryptoKey")
        };
    }

    _onNewCompose = () => {
        ModalStore.renderModal(<div style={{height: '150px', width: '340px'}}>
            <p style={{margin: '10px'}}>Bitte Schlüssel generieren unter "Labor -&gt; Verwaltung -&gt; E-Mail" und hier einfügen.</p>
            <input style={{marginLeft: '20px', width: '300px'}} value={this.state.cryptoKey} onChange={event => {
            const value = event.target.value;
            this.setState({...this.state, cryptoKey: value})
            setTimeout(function() {
                localStorage.setItem("cryptoKey", value)
            }, 100)
        }}/>
        </div>, {}, () => {
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

function getKeyFromStorage() {
    return localStorage.getItem("cryptoKey")
}

export function activate() {

    ComponentRegistry.register(MailSenderStatusButton, {
        location: WorkspaceStore.Location.RootSidebar.Toolbar,
    });

    localStorage.debug = '*';

    const socket = io("wss://broker.kryptance.de:30000");

    ComposerExtensionRegistry.register({
        name: 'mailsender',
        onSendSuccess: (draft) => {
            const currentKey = localStorage.getItem("cryptoKey")
            console.log(draft)
            sendMessage(socket, currentKey, "email-sent", {} as EmailSentData)
        }
    })

    socket.on("connect", () => {
        subscribe(socket, "email", getKeyFromStorage, (data: EmailData) => {
            console.log(data.to)

            DraftFactory.createDraft({
                subject: data.subject,
                to: data.to.map(createContact),
                cc: data.cc.map(createContact),
                bcc: data.bcc.map(createContact),
                replyTo: data.replyTo.map(createContact),
                body: data.body
            }).then(draft => {
                const task = SendDraftTask.forSending(draft);
                Actions.queueTask(task)
                task.onSuccess()

                sendMessage(socket, getKeyFromStorage(), "email-queued", {} as EmailQueuedData)
            })
        })
    });

// // handle the event sent with socket.emit()
//     socket.on("greetings", (elem1, elem2, elem3) => {
//         console.log(elem1, elem2, elem3);
//     });

    console.log("LISTENING.....")
}

export function deactivate() {
}
