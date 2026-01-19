import { WASocket, Contact } from '@whiskeysockets/baileys';
import * as fs from 'fs';
import pino from 'pino';

export interface Store {
    contacts: Record<string, Contact>;
    bind(ev: WASocket['ev']): void;
    readFromFile(path: string): void;
    writeToFile(path: string): void;
}

export function makeInMemoryStore(config: { logger?: any }): Store {
    const logger = config.logger || pino({ level: 'silent' });
    const contacts: Record<string, Contact> = {};

    const bind = (ev: WASocket['ev']) => {
        ev.on('contacts.upsert', (newContacts) => {
            for (const contact of newContacts) {
                if (contact.id) {
                    contacts[contact.id] = Object.assign(contacts[contact.id] || {}, contact);
                }
            }
        });

        ev.on('contacts.update', (updates) => {
            for (const update of updates) {
                if (update.id) {
                    contacts[update.id] = Object.assign(contacts[update.id] || {}, update);
                }
            }
        });
    };

    const readFromFile = (path: string) => {
        if (fs.existsSync(path)) {
            try {
                const data = fs.readFileSync(path, 'utf-8');
                const json = JSON.parse(data);
                if (json.contacts) {
                    Object.assign(contacts, json.contacts);
                }
            } catch (error) {
                logger.error({ error }, 'Failed to read store from file');
            }
        }
    };

    const writeToFile = (path: string) => {
        try {
            fs.writeFileSync(path, JSON.stringify({ contacts }, null, 2));
        } catch (error) {
            logger.error({ error }, 'Failed to write store to file');
        }
    };

    return {
        contacts,
        bind,
        readFromFile,
        writeToFile,
    };
}
