export type MailpitResponse = {
	/** Messages */
	messages: {
		/** The number of attachments */
		Attachments: number;
		/** BCC addresses */
		Bcc: MailpitEmailAddressResponse[];
		/** CC addresses */
		Cc: MailpitEmailAddressResponse[];
		/** Created time in ISO format: 1970-01-01T00:00:00.000Z */
		Created: string;
		/** Sender address */
		From: MailpitEmailAddressResponse;
		/** Database ID */
		ID: string;
		/** Message ID */
		MessageID: string;
		/** Read status */
		Read: boolean;
		/** Reply-To addresses */
		ReplyTo: MailpitEmailAddressResponse[];
		/** Message size in bytes (total) */
		Size: number;
		/** Message snippet includes up to 250 characters */
		Snippet: string;
		/** Email subject */
		Subject: string;
		/** Message tags */
		Tags: string[];
		/** To addresses */
		To: MailpitEmailAddressResponse[];
	}[];
	/** Total number of messages matching the current query */
	messages_count: number;
	/** Total number of unread messages matching current query */
	messages_unread: number;
	/** Pagination offset */
	start: number;
	/** All current tags */
	tags: string[];
	/** Total number of messages in mailbox */
	total: number;
	/** Total number of unread messages in mailbox */
	unread: number;
};

/** Represents a name and email address from a response. */
export type MailpitEmailAddressResponse = {
	/** Email address */
	Address: string;
	/** Name associated with the email address */
	Name: string;
};
