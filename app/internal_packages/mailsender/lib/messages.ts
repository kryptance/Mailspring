
// email-queued .......................

export type EmailQueuedData = {
    befundboteCode: string,
    emailId: string
}

// email ..........................

export type EmailContact = {
    email: string,
    name: string
}

export type EmailData = {
    subject: string,
    to: EmailContact[],
    cc: EmailContact[],
    bcc: EmailContact[],
    replyTo: EmailContact[],
    body: string,
    befundboteCode: string
}

// ..................................
