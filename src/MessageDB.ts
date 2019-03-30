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

        this.client.incr('messageIdCounter', (err, c) => {
            this.messageIdCounter = c;
        });
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