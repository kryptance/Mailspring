
// email-queued .......................

export type EmailQueuedData = {
    id: string,
    emailId: string
}

// email-sent ..........................

export type EmailSentData = {
    email: string,
    emailId: string
}

// email ..........................

export type EmailContact = {
    email: string,
    name: string
}

export type EmailData = {
    id: string,
    subject: string,
    to: EmailContact[],
    cc: EmailContact[],
    bcc: EmailContact[],
    replyTo: EmailContact[],
    body: string
}

// ..................................
