import redis from 'redis';
import Message from './Message';

export default class MessageDB {
    client: redis.RedisClient;
    connected: boolean;
    messageIdCounter: number;

    constructor() {
        this.client = redis.createClient();
        this.connected = false;
        this.messageIdCounter = 0;
        this.client.on('connect', (err) => {
            console.log('connected to redis');
            this.connected = true;

            this.client.get('messageIdCounter', (err, c) => {
                if (c) {
                    this.messageIdCounter = parseInt(c);
                    console.log('found previous message id', c);
                } else {
                    this.client.set('messageIdCounter', "0");
                    console.log('no previous message id, setting to 0')
                }
            })
        });
    }

    addNewMessage = (message: Message) => {
        message.id = this.messageIdCounter;
        this.client.set('message' + message.id.toString(),
            JSON.stringify(message));

        // Keep a mapping between invoice to msg id.
        this.client.set(message.invoice, message.id.toString());

        this.client.incr('messageIdCounter', (err, c) => {
            this.messageIdCounter = c;
        });
    }

    settleMessageWithInvoice = (invoice: string,fnMsgId:Function) => {
        this.client.get(invoice, (err, id) => {
            if(err) {
                console.error('Couldn\'t get id for invoice',invoice);
            }else{
                this.client.get('message'+id, (err, message) => {
                    if(err){
                        console.log("couldn't settle invoice",invoice, err);
                    }else{
                        let msgJson = JSON.parse(message);
                        msgJson.settled = true;
                        this.client.set('message'+id, JSON.stringify(msgJson));
                        fnMsgId(id);
                    }
                })
            }
        })
    }

    getLastNMessages = (nMessages: number, fn: Function) => {
        let beginningIx = this.messageIdCounter - nMessages;
        if (beginningIx<0){
            beginningIx = 0;
        }
        let keys = [];
        while(beginningIx < this.messageIdCounter) {
            keys.push("message"+beginningIx.toString());
            beginningIx++;
        }
        this.client.mget(keys, (err, messages) => {
            if(err){
                console.log('couldn\'t get last n messages from redis',err);
                fn([]);
            } else {
                fn(messages.map(m => JSON.parse(m)));
            }
        })
    }
}