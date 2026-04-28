/**
 * scheduler.js — Planificador del RTOS
 * Implementa un scheduler preventivo basado en prioridades (0 = máxima).
 * En cada evaluación, selecciona la tarea READY de mayor prioridad.
 * Si hay una tarea RUNNING de menor prioridad, ocurre preempción.
 */

class Scheduler {
    constructor() {
        this.idleTask = null;
    }

    /**
     * Configura la tarea IDLE que se ejecuta cuando no hay tareas listas
     * @param {Task} task
     */
    setIdleTask(task) {
        this.idleTask = task;
    }

    /**
     * Evalúa y selecciona la próxima tarea a ejecutar
     * Aplica algoritmo de scheduling preventivo por prioridad.
     * @returns {{ selectedTask: Task|null, preempted: boolean, preemptedTask: Task|null, reason: string }}
     */
    schedule() {
        const readyTasks = kernel.getReadyTasks();
        const currentTask = kernel.runningTask;

        // Si no hay tareas listas, ejecutar IDLE
        if (readyTasks.length === 0) {
            if (currentTask && currentTask.id === 'idle') {
                return {
                    selectedTask: currentTask,
                    preempted: false,
                    preemptedTask: null,
                    reason: 'Sin tareas listas. IDLE continúa ejecutando.'
                };
            }
            // Cambiar a IDLE
            if (currentTask && currentTask.state === 'RUNNING') {
                currentTask.setState('READY', 'Planificador selecciona IDLE');
            }
            if (this.idleTask) {
                this.idleTask.setState('RUNNING', 'Sin tareas listas, ejecutando IDLE');
                kernel.runningTask = this.idleTask;
                kernel.contextSwitchOccurred = true;
            }
            return {
                selectedTask: this.idleTask,
                preempted: false,
                preemptedTask: currentTask,
                reason: '⚠️ Ninguna tarea lista. Ejecutando tarea IDLE (mínima prioridad).'
            };
        }

        // Tarea de mayor prioridad entre las READY (menor número = mayor prioridad)
        const bestReadyTask = readyTasks[0];

        // Si no hay tarea ejecutándose actualmente
        if (!currentTask || currentTask.state !== 'RUNNING') {
            bestReadyTask.setState('RUNNING', 'Planificador asigna CPU');
            if (currentTask && currentTask !== bestReadyTask && currentTask.state === 'RUNNING') {
                currentTask.setState('READY', 'Desalojado por planificador');
            }
            kernel.runningTask = bestReadyTask;
            kernel.contextSwitchOccurred = true;
            return {
                selectedTask: bestReadyTask,
                preempted: false,
                preemptedTask: currentTask,
                reason: `✅ Planificador selecciona "${bestReadyTask.name}" (prioridad ${bestReadyTask.priority}, la más alta entre las listas).`
            };
        }

        // Hay tarea ejecutándose. ¿Debe ser desalojada?
        if (currentTask.id === 'idle') {
            // IDLE cede ante cualquier tarea real
            currentTask.setState('READY', 'IDLE cede CPU');
            bestReadyTask.setState('RUNNING', 'Planificador asigna CPU a tarea real');
            kernel.runningTask = bestReadyTask;
            kernel.contextSwitchOccurred = true;
            return {
                selectedTask: bestReadyTask,
                preempted: true,
                preemptedTask: currentTask,
                reason: `🔄 IDLE cede CPU. "${bestReadyTask.name}" (prioridad ${bestReadyTask.priority}) toma el control.`
            };
        }

        if (bestReadyTask.priority < currentTask.priority) {
            // ¡PREEMPCIÓN! La tarea lista tiene mayor prioridad (menor número)
            const oldTask = currentTask;
            oldTask.setState('READY', `Desalojado por tarea de mayor prioridad: "${bestReadyTask.name}"`);
            bestReadyTask.setState('RUNNING', 'Preempción: mayor prioridad');
            kernel.runningTask = bestReadyTask;
            kernel.contextSwitchOccurred = true;
            kernel.preemptedTask = oldTask;
            kernel.logEvent('preemption',
                `⚡ PREEMPCIÓN: "${oldTask.name}" (prio ${oldTask.priority}) desalojado por ` +
                `"${bestReadyTask.name}" (prio ${bestReadyTask.priority}). Cambio de contexto.`
            );
            return {
                selectedTask: bestReadyTask,
                preempted: true,
                preemptedTask: oldTask,
                reason: `⚡ ¡PREEMPCIÓN! "${bestReadyTask.name}" (prioridad ${bestReadyTask.priority}) tiene mayor prioridad que "${oldTask.name}" (prioridad ${oldTask.priority}). Se realiza cambio de contexto.`
            };
        }

        // La tarea actual sigue siendo la de mayor prioridad
        return {
            selectedTask: currentTask,
            preempted: false,
            preemptedTask: null,
            reason: `📌 "${currentTask.name}" (prioridad ${currentTask.priority}) continúa ejecutando. Es la tarea de mayor prioridad lista.`
        };
    }

    /**
     * Fuerza una reevaluación del planificador (útil tras cambios de estado)
     */
    reschedule() {
        return this.schedule();
    }
}

const scheduler = new Scheduler();