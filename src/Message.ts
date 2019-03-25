export default interface Message {
    id: number;
    nickname: string;
    settled: boolean;
    message: string;
    invoice: string;
}