/**
 * queue.js — Cola de Mensajes (Message Queue) para comunicación entre tareas
 * Implementa el patrón FIFO típico de RTOS como FreeRTOS.
 */

class MessageQueue {
    /**
     * @param {string} id - Identificador único
     * @param {string} name - Nombre descriptivo
     * @param {number} capacity - Capacidad máxima de mensajes
     */
    constructor(id, name, capacity = 5) {
        this.id = id;
        this.name = name;
        this.capacity = capacity;
        /** @type {object[]} Mensajes en la cola */
        this.messages = [];
        /** @type {Task[]} Tareas bloqueadas esperando recibir */
        this.waitingReceivers = [];
        /** @type {Task[]} Tareas bloqueadas esperando enviar (cola llena) */
        this.waitingSenders = [];
    }

    /**
     * Intenta enviar un mensaje a la cola
     * @param {object} message - El mensaje a enviar
     * @param {Task} sender - Tarea que envía
     * @returns {boolean} true si se envió exitosamente
     */
    send(message, sender) {
        if (this.messages.length >= this.capacity) {
            // Cola llena: la tarea se bloquea esperando espacio
            this.waitingSenders.push(sender);
            sender.setState('BLOCKED', `Cola "${this.name}" llena, esperando espacio`);
            sender.blockedOn = this.id;
            kernel.logEvent('block', `📬 Cola "${this.name}" LLENA. Tarea "${sender.name}" bloqueada esperando enviar.`);
            return false;
        }

        this.messages.push({
            content: message,
            senderId: sender.id,
            timestamp: kernel.systemTick
        });
        kernel.logEvent('task', `📨 Tarea "${sender.name}" envió mensaje a cola "${this.name}". Mensajes en cola: ${this.messages.length}/${this.capacity}`);

        // Desbloquear al primer receptor esperando
        if (this.waitingReceivers.length > 0) {
            const receiver = this.waitingReceivers.shift();
            receiver.setState('READY', `Mensaje disponible en cola "${this.name}"`);
            receiver.blockedOn = null;
            kernel.logEvent('system', `🔓 Tarea "${receiver.name}" desbloqueada: hay mensaje en cola "${this.name}"`);
        }

        return true;
    }

    /**
     * Intenta recibir un mensaje de la cola
     * @param {Task} receiver - Tarea que recibe
     * @returns {object|null} El mensaje o null si la cola está vacía
     */
    receive(receiver) {
        if (this.messages.length === 0) {
            // Cola vacía: la tarea se bloquea esperando mensaje
            this.waitingReceivers.push(receiver);
            receiver.setState('BLOCKED', `Cola "${this.name}" vacía, esperando mensaje`);
            receiver.blockedOn = this.id;
            kernel.logEvent('block', `📭 Cola "${this.name}" VACÍA. Tarea "${receiver.name}" bloqueada esperando recibir.`);
            return null;
        }

        const msg = this.messages.shift();
        kernel.logEvent('task', `📩 Tarea "${receiver.name}" recibió mensaje de cola "${this.name}". Mensajes restantes: ${this.messages.length}/${this.capacity}`);

        // Desbloquear al primer emisor esperando (si había cola llena)
        if (this.waitingSenders.length > 0) {
            const sender = this.waitingSenders.shift();
            sender.setState('READY', `Espacio disponible en cola "${this.name}"`);
            sender.blockedOn = null;
            kernel.logEvent('system', `🔓 Tarea "${sender.name}" desbloqueada: hay espacio en cola "${this.name}"`);
        }

        return msg;
    }

    /**
     * Retorna la cantidad de mensajes en la cola
     */
    getCount() {
        return this.messages.length;
    }
}