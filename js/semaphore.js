/**
 * semaphore.js — Semáforo para sincronización de tareas
 * Implementa semáforos binarios y contadores, como en FreeRTOS.
 */

class Semaphore {
    /**
     * @param {string} id - Identificador único
     * @param {string} name - Nombre descriptivo
     * @param {number} maxCount - Valor máximo (1 = binario, >1 = contador)
     * @param {number} initialCount - Valor inicial
     */
    constructor(id, name, maxCount = 1, initialCount = 1) {
        this.id = id;
        this.name = name;
        this.maxCount = maxCount;
        this.count = initialCount;
        /** @type {Task[]} Tareas bloqueadas esperando el semáforo */
        this.waitingTasks = [];
    }

    /**
     * Intenta tomar (acquire) el semáforo
     * @param {Task} task - Tarea que solicita el semáforo
     * @returns {boolean} true si lo obtuvo
     */
    acquire(task) {
        if (this.count > 0) {
            this.count--;
            kernel.logEvent('task', `🔒 Tarea "${task.name}" adquirió semáforo "${this.name}". Valor actual: ${this.count}/${this.maxCount}`);
            return true;
        }

        // Semáforo no disponible: bloquear tarea (cola ordenada por prioridad)
        this.waitingTasks.push(task);
        this.waitingTasks.sort((a, b) => a.priority - b.priority);
        task.setState('BLOCKED', `Esperando semáforo "${this.name}" (valor: 0)`);
        task.blockedOn = this.id;
        kernel.logEvent('block', `⛔ Semáforo "${this.name}" no disponible. Tarea "${task.name}" bloqueada.`);
        return false;
    }

    /**
     * Libera (release) el semáforo
     * @param {Task} task - Tarea que libera
     */
    release(task) {
        if (this.count < this.maxCount) {
            this.count++;
            kernel.logEvent('task', `🔓 Tarea "${task.name}" liberó semáforo "${this.name}". Valor actual: ${this.count}/${this.maxCount}`);
        }

        // Despertar a la primera tarea en espera
        if (this.waitingTasks.length > 0) {
            const waitingTask = this.waitingTasks.shift();
            // La tarea despertada adquiere el semáforo implícitamente
            this.count--;
            waitingTask.setState('READY', `Semáforo "${this.name}" disponible, despertando`);
            waitingTask.blockedOn = null;
            kernel.logEvent('system', `🌟 Tarea "${waitingTask.name}" desbloqueada y tomó semáforo "${this.name}". Valor: ${this.count}/${this.maxCount}`);
        }
    }

    /**
     * Indica si el semáforo está disponible
     */
    isAvailable() {
        return this.count > 0;
    }
}