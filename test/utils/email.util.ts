import axios from 'axios';

type MailHogResponse = {
  total?: number;
  count?: number;
  start?: number;
  items: MailHogMessage[];
};

type MailHogMessage = {
  ID: string;
  To?: {Mailbox: string; Domain: string; Params: any}[];
  Content?: {
    Headers?: {
      Subject?: string[];
      [key: string]: any;
    };
    Body?: string;
    [key: string]: any;
  };
};

export async function clearEmails(apiUrl: string) {
  await axios.delete(`${apiUrl}/api/v1/messages`);
}

export async function findEmailByRecipient(recipientEmail: string, apiUrl: string) {
  let retries = 5;
  const delayMs = 50;

  while (retries > 0) {
    const response = await axios.get<MailHogResponse>(`${apiUrl}/api/v2/messages`);
    const email = response.data?.items?.find((msg) =>
      msg.To?.some((recipient) => recipient.Mailbox + '@' + recipient.Domain === recipientEmail),
    );

    if (email) return email;

    retries--;
    if (retries > 0) await sleep(delayMs);
  }
  return undefined;
}

export function extractVerificationCode(body: string | undefined) {
  if (!body) return null;
  const match = body.match(/following code:\s*(\d{6})/i);
  return match ? match[1] : null;
}

export function sleep(ms: number = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
