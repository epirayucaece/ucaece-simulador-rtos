/**
 * mutex.js — Mutex con Priority Inheritance Protocol (PIP)
 *
 * Diferencia clave con el semáforo binario:
 *   - El mutex tiene PROPIETARIO: solo la tarea que lo adquirió puede liberarlo.
 *   - Implementa PIP: cuando una tarea de alta prioridad (TH) queda bloqueada
 *     esperando el mutex que posee una tarea de baja prioridad (TL), el RTOS
 *     eleva temporalmente la prioridad de TL a la de TH, evitando que tareas de
 *     prioridad media (TM) interrumpan a TL indefinidamente.
 *
 * Referencia académica:
 *   Silberschatz, A., Galvin, P., Gagne, G. (2006, p.647):
 *   "VxWorks proporciona semáforos y cerrojos mutex con un protocolo de herencia
 *    de prioridades con el fin de evitar el fenómeno de inversión de prioridad."
 *
 *   González Harbour, M. (2001): "Un mecanismo de sincronización conocido como
 *   mutex evita la inversión de prioridad no acotada."
 */

class Mutex {
    /**
     * @param {string} id   - Identificador único
     * @param {string} name - Nombre descriptivo
     */
    constructor(id, name) {
        this.id = id;
        this.name = name;

        /** @type {Task|null} Tarea propietaria actual (solo ella puede liberar) */
        this.owner = null;

        /** @type {Task[]} Cola de espera ordenada por prioridad (menor número = mayor prioridad) */
        this.waitingTasks = [];
    }

    /**
     * Intenta adquirir el mutex.
     *
     * - Si está libre: lo toma y registra la tarea como propietaria.
     * - Si está ocupado: bloquea la tarea solicitante y, si tiene mayor prioridad
     *   que el propietario actual, aplica PIP elevando la prioridad del propietario.
     *
     * @param {Task} task - Tarea que solicita el mutex
     * @returns {boolean} true si lo adquirió inmediatamente
     */
    acquire(task) {
        if (!this.owner) {
            this.owner = task;
            kernel.logEvent('mutex',
                `🔑 "${task.name}" adquirió mutex "${this.name}". ` +
                `Es ahora el propietario exclusivo.`
            );
            return true;
        }

        // Mutex ocupado: encolar ordenado por prioridad
        this.waitingTasks.push(task);
        this.waitingTasks.sort((a, b) => a.priority - b.priority);

        task.setState('BLOCKED',
            `Esperando mutex "${this.name}" (propietario actual: "${this.owner.name}")`
        );
        task.blockedOn = this.id;

        kernel.logEvent('mutex',
            `⛔ Mutex "${this.name}" ocupado por "${this.owner.name}". ` +
            `"${task.name}" (p:${task.priority}) bloqueada y encolada.`
        );

        // PIP: elevar prioridad del propietario si el solicitante tiene mayor prioridad
        if (task.priority < this.owner.priority) {
            if (this.owner.originalPriority === null) {
                this.owner.originalPriority = this.owner.priority;
            }
            const prevPriority = this.owner.priority;
            this.owner.priority = task.priority;

            kernel.logEvent('pip',
                `🔺 PIP ACTIVO: "${this.owner.name}" hereda prioridad ${task.priority} ` +
                `de "${task.name}" (su prioridad original era ${prevPriority}). ` +
                `Ninguna tarea con prioridad entre ${task.priority + 1} y ${prevPriority - 1} ` +
                `podrá interrumpir al propietario mientras esté en sección crítica.`
            );
        }

        return false;
    }

    /**
     * Libera el mutex. Solo el propietario puede liberarlo.
     *
     * - Restaura la prioridad original del propietario si el PIP la había elevado.
     * - Desbloquea a la tarea de mayor prioridad en espera (si la hay) y la hace
     *   la nueva propietaria.
     *
     * @param {Task} task - Tarea que intenta liberar el mutex
     * @returns {boolean} true si se liberó correctamente
     */
    release(task) {
        if (this.owner !== task) {
            kernel.logEvent('mutex',
                `⚠️ Error: "${task.name}" intenta liberar mutex "${this.name}" ` +
                `que no le pertenece. El dueño es "${this.owner ? this.owner.name : 'nadie'}".`
            );
            return false;
        }

        // Restaurar prioridad original si PIP la había elevado
        if (task.originalPriority !== null) {
            const elevatedPriority = task.priority;
            task.priority = task.originalPriority;
            task.originalPriority = null;
            kernel.logEvent('pip',
                `🔻 PIP RESTAURADO: "${task.name}" vuelve a su prioridad original ${task.priority} ` +
                `(tenía prioridad heredada: ${elevatedPriority}). ` +
                `El sistema de prioridades recupera su orden natural.`
            );
        }

        this.owner = null;
        kernel.logEvent('mutex', `🔓 "${task.name}" liberó mutex "${this.name}".`);

        // Despertar a la tarea de mayor prioridad en espera (ya ordenada)
        if (this.waitingTasks.length > 0) {
            const next = this.waitingTasks.shift();
            this.owner = next;
            next.setState('READY', `Mutex "${this.name}" adquirido — nueva propietaria`);
            next.blockedOn = null;
            kernel.logEvent('mutex',
                `✅ "${next.name}" adquiere mutex "${this.name}" y pasa a READY ` +
                `como nueva propietaria.`
            );
        }

        return true;
    }

    /** @returns {boolean} Indica si el mutex está tomado */
    isLocked() {
        return this.owner !== null;
    }
}
