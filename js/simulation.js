/**
 * simulation.js — Controlador de la simulación paso a paso
 * Contiene el guion de eventos que demuestra los principios clave de un RTOS:
 * - Scheduling por prioridad
 * - Preempción
 * - Semáforos (bloqueo/desbloqueo)
 * - Colas de mensajes
 * - Cambio de contexto
 * - Tarea IDLE
 */

class Simulation {
    constructor() {
        /** @type {number} Paso actual de la simulación */
        this.currentStep = -1;

        /** @type {boolean} Simulación iniciada */
        this.started = false;

        /** @type {boolean} Simulación completada */
        this.completed = false;

        /** @type {number|null} ID del intervalo de auto-play */
        this.autoPlayInterval = null;

        /** @type {boolean} Modo auto-play activo */
        this.autoPlayActive = false;

        /**
         * Guion de pasos de la simulación.
         * Cada paso tiene: title, description, y una función action()
         * que modifica el estado del kernel.
         */
        this.steps = [];
        this.buildSteps();
    }

    /**
     * Construye el guion de simulación con todos los pasos
     */
    buildSteps() {
        this.steps = [
            // Paso 0: Inicialización
            {
                title: '🔧 Inicialización del Sistema',
                description: 'El RTOS arranca. Se crean 5 tareas con distintas prioridades (0=máxima prioridad, como en FreeRTOS). Todas las tareas pasan al estado <strong>READY</strong>. El planificador aún no ha seleccionado ninguna para ejecutar. Observa la cola de tareas listas ordenadas por prioridad.',
                action: () => {
                    kernel.initialize();
                    kernel.tasks = [];
                    kernel.semaphores = [];
                    kernel.messageQueues = [];
                    this.createTasks();
                    this.createResources();
                    kernel.logEvent('system', '🔧 Sistema inicializado. 5 tareas creadas, todas en estado READY.');
                    kernel.logEvent('system', '📋 Cola de READY: ' + kernel.getReadyTasks().map(t => t.name + '(P' + t.priority + ')').join(', '));
                }
            },

            // Paso 1: Primer scheduling
            {
                title: '🎯 Primer Scheduling: El Planificador Elige',
                description: 'El <strong>scheduler</strong> evalúa la cola de tareas READY y selecciona la de <strong>mayor prioridad</strong>. La <strong>Tarea A (Control Motor, prioridad 0)</strong> es la más prioritaria. Pasa a estado <strong>RUNNING</strong> y ocupa la CPU.',
                action: () => {
                    kernel.tick();
                    const result = scheduler.schedule();
                    kernel.logEvent('scheduler', `🎯 Planificador: ${result.reason}`);
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Inicializando control del motor...');
                        result.selectedTask.incrementExecution();
                    }
                }
            },

            // Paso 2: Tarea A adquiere semáforo
            {
                title: '🔒 Adquisición de Semáforo (Recurso Compartido)',
                description: 'La <strong>Tarea A</strong> necesita acceder a un recurso protegido por el <strong>semáforo binario "I2C_Bus"</strong>. Como está disponible, lo adquiere exitosamente y continúa ejecutando. El semáforo pasa a estado TOMADO (🔴).',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    const semI2C = kernel.semaphores.find(s => s.id === 'sem_i2c');
                    if (taskA && semI2C && taskA.state === 'RUNNING') {
                        taskA.setInstruction('Adquiriendo semáforo I2C_Bus...');
                        semI2C.acquire(taskA);
                        taskA.setInstruction('Ejecutando sección crítica (I2C_Bus tomado)');
                        taskA.incrementExecution();
                    }
                    scheduler.schedule();
                }
            },

            // Paso 3: Tarea B intenta adquirir el mismo semáforo
            {
                title: '⛔ Intento Fallido de Adquisición — Bloqueo',
                description: 'La <strong>Tarea B (Sensor, prioridad 1)</strong> también necesita el bus I2C. Como el semáforo está tomado por la Tarea A, la <strong>Tarea B se BLOQUEA</strong> y pasa al estado BLOCKED, esperando que el semáforo se libere. La Tarea A (prioridad 0) sigue ejecutando porque tiene mayor prioridad.',
                action: () => {
                    kernel.tick();
                    const taskB = kernel.getTaskById('task_b');
                    const semI2C = kernel.semaphores.find(s => s.id === 'sem_i2c');
                    if (taskB && semI2C && taskB.state === 'READY') {
                        taskB.setInstruction('Intentando adquirir semáforo I2C_Bus...');
                        const acquired = semI2C.acquire(taskB);
                        if (!acquired) {
                            taskB.setInstruction('Esperando semáforo I2C_Bus...');
                        }
                    }
                    const taskA = kernel.getTaskById('task_a');
                    if (taskA && taskA.state === 'RUNNING') {
                        taskA.setInstruction('Sección crítica en progreso...');
                        taskA.incrementExecution();
                    }
                    scheduler.schedule();
                }
            },

            // Paso 4: Tarea A libera el semáforo — Tarea B se desbloquea
            {
                title: '🔓 Liberación de Semáforo y Desbloqueo',
                description: 'La <strong>Tarea A</strong> completa su sección crítica y <strong>libera el semáforo I2C_Bus</strong>. Inmediatamente, la <strong>Tarea B se desbloquea</strong> y adquiere el semáforo. Como la Tarea A (prioridad 0) sigue siendo más prioritaria que la Tarea B (prioridad 1), <strong>no hay preempción</strong>. La Tarea B queda en READY.',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    const semI2C = kernel.semaphores.find(s => s.id === 'sem_i2c');
                    if (taskA && semI2C && taskA.state === 'RUNNING') {
                        taskA.setInstruction('Liberando semáforo I2C_Bus...');
                        semI2C.release(taskA);
                        taskA.setInstruction('Sección crítica completada. Continúa ejecutando.');
                        taskA.incrementExecution();
                    }
                    scheduler.schedule();
                }
            },

            // Paso 5: Tarea A se bloquea (delay voluntario) — Tarea B toma CPU
            {
                title: '🔄 Tarea A se Bloquea — Cambio de Contexto',
                description: 'La <strong>Tarea A</strong> completa su trabajo crítico y se bloquea voluntariamente (simulando una espera por evento). El <strong>scheduler</strong> selecciona ahora a la <strong>Tarea B (prioridad 1)</strong>, que es la más prioritaria entre las READY. Ocurre un <strong>cambio de contexto</strong>.',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    if (taskA && taskA.state === 'RUNNING') {
                        taskA.setState('BLOCKED', 'Esperando evento externo (delay voluntario)');
                        taskA.blockedOn = 'event_delay';
                        taskA.setInstruction('Esperando evento...');
                    }
                    const result = scheduler.reschedule();
                    kernel.logEvent('scheduler', `🔄 ${result.reason}`);
                    if (result.selectedTask && result.selectedTask.id !== 'task_a') {
                        result.selectedTask.setInstruction('¡CPU asignada! Iniciando lectura de sensor...');
                        result.selectedTask.incrementExecution();
                    }
                }
            },

            // Paso 6: Tarea B envía mensaje por cola
            {
                title: '📨 Comunicación por Cola de Mensajes',
                description: 'La <strong>Tarea B</strong> necesita enviar datos a la <strong>Tarea C (Comunicación)</strong>. Usa la <strong>cola de mensajes "SensorData"</strong>. El mensaje se encola exitosamente. Las colas son el mecanismo principal de comunicación entre tareas en un RTOS.',
                action: () => {
                    kernel.tick();
                    const taskB = kernel.getTaskById('task_b');
                    const queueSensor = kernel.messageQueues.find(q => q.id === 'q_sensor');
                    if (taskB && taskB.state === 'RUNNING' && queueSensor) {
                        taskB.setInstruction('Enviando datos del sensor por cola...');
                        queueSensor.send({ type: 'sensor_reading', value: 42.5, unit: '°C' }, taskB);
                        taskB.setInstruction('Datos enviados. Continuando...');
                        taskB.incrementExecution();
                    }
                    scheduler.schedule();
                }
            },

            // Paso 7: Tarea B se bloquea esperando confirmación — Tarea C toma CPU
            {
                title: '📭 Tarea B Espera Respuesta — Nuevo Cambio de Contexto',
                description: 'La <strong>Tarea B</strong> se bloquea esperando una confirmación por otra cola. El scheduler selecciona a la <strong>Tarea C (prioridad 2)</strong>. La Tarea C recibe el mensaje pendiente de la cola "SensorData".',
                action: () => {
                    kernel.tick();
                    const taskB = kernel.getTaskById('task_b');
                    const queueAck = kernel.messageQueues.find(q => q.id === 'q_ack');
                    if (taskB && taskB.state === 'RUNNING' && queueAck) {
                        taskB.setInstruction('Esperando confirmación (ACK)...');
                        queueAck.receive(taskB); // Se bloqueará porque la cola está vacía
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask && result.selectedTask.id === 'task_c') {
                        const queueSensor = kernel.messageQueues.find(q => q.id === 'q_sensor');
                        result.selectedTask.setInstruction('Recibiendo datos de cola SensorData...');
                        const msg = queueSensor ? queueSensor.receive(result.selectedTask) : null;
                        if (msg) {
                            result.selectedTask.setInstruction(`Procesando: ${msg.content.value}${msg.content.unit}`);
                        }
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('scheduler', `🔄 ${result.reason}`);
                }
            },

            // Paso 8: Tarea C envía confirmación — Tarea B se desbloquea ¡Preempción!
            {
                title: '⚡ Preempción por Prioridad',
                description: 'La <strong>Tarea C</strong> envía la confirmación por la cola "ACK", lo que <strong>desbloquea a la Tarea B (prioridad 1)</strong>. Como la Tarea B tiene <strong>mayor prioridad</strong> que la Tarea C (prioridad 2), el scheduler <strong>desaloja a C y ejecuta B</strong>. ¡Esto es <strong>PREEMPCIÓN</strong>!',
                action: () => {
                    kernel.tick();
                    const taskC = kernel.getTaskById('task_c');
                    const queueAck = kernel.messageQueues.find(q => q.id === 'q_ack');
                    const taskB = kernel.getTaskById('task_b');
                    if (taskC && taskC.state === 'RUNNING' && queueAck) {
                        taskC.setInstruction('Enviando confirmación (ACK)...');
                        queueAck.send({ type: 'ack', status: 'ok' }, taskC);
                        taskC.setInstruction('ACK enviado.');
                        taskC.incrementExecution();
                    }
                    // Al desbloquearse B, el scheduler debe reevaluar
                    const result = scheduler.reschedule();
                    kernel.logEvent('scheduler', `⚡ ${result.reason}`);
                    if (result.preempted && result.selectedTask) {
                        result.selectedTask.setInstruction('¡CPU recuperada! Recibiendo confirmación...');
                        const msg = queueAck ? queueAck.receive(result.selectedTask) : null;
                        if (msg) {
                            result.selectedTask.setInstruction(`Confirmación recibida: ${msg.content.status}`);
                        }
                        result.selectedTask.incrementExecution();
                    }
                }
            },

            // Paso 9: Tarea B completa — Tarea C reanuda
            {
                title: '✅ Tarea B Completa — Tarea C Reanuda',
                description: 'La <strong>Tarea B</strong> finaliza su trabajo y se bloquea en espera del próximo ciclo. El scheduler restaura a la <strong>Tarea C (prioridad 2)</strong>, que continúa desde donde fue interrumpida.',
                action: () => {
                    kernel.tick();
                    const taskB = kernel.getTaskById('task_b');
                    if (taskB && taskB.state === 'RUNNING') {
                        taskB.setState('BLOCKED', 'Ciclo completado, esperando próximo periodo');
                        taskB.blockedOn = 'periodic_wait';
                        taskB.setInstruction('Esperando próximo ciclo...');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Reanudando procesamiento...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('scheduler', `✅ ${result.reason}`);
                }
            },

            // Paso 10: Tarea C completa — Tarea D toma CPU
            {
                title: '📋 Tarea de Baja Prioridad Toma la CPU',
                description: 'Con las tareas de alta prioridad bloqueadas, el scheduler selecciona a la <strong>Tarea D (Interfaz, prioridad 3)</strong>. En un RTOS, las tareas de baja prioridad solo ejecutan cuando las de alta prioridad están bloqueadas.',
                action: () => {
                    kernel.tick();
                    const taskC = kernel.getTaskById('task_c');
                    if (taskC && taskC.state === 'RUNNING') {
                        taskC.setState('BLOCKED', 'Procesamiento completado');
                        taskC.blockedOn = 'completed';
                        taskC.setInstruction('Completado.');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Actualizando interfaz de usuario...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('scheduler', `📋 ${result.reason}`);
                }
            },

            // Paso 11: Tarea A se reactiva — Preempción de D
            {
                title: '⚡ Reactivación y Preempción — Tarea Crítica Despierta',
                description: 'La <strong>Tarea A (prioridad 0)</strong> se reactiva (el evento que esperaba ocurre). Como tiene <strong>máxima prioridad</strong>, el scheduler <strong>desaloja inmediatamente a la Tarea D</strong>. Esto demuestra que en un RTOS, las tareas críticas siempre obtienen la CPU cuando la necesitan.',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    if (taskA && taskA.state === 'BLOCKED') {
                        taskA.setState('READY', 'Evento externo recibido, reactivando tarea crítica');
                        taskA.blockedOn = null;
                        taskA.setInstruction('Reactivada. Necesita CPU urgentemente.');
                    }
                    const result = scheduler.reschedule();
                    if (result.preempted && result.selectedTask) {
                        result.selectedTask.setInstruction('Ejecutando tarea crítica urgente...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('preemption', `⚡ ${result.reason}`);
                }
            },

            // Paso 12: Tarea A completa su ráfaga — D reanuda
            {
                title: '🔄 Tarea Crítica Completa — Tarea D Reanuda',
                description: 'La <strong>Tarea A</strong> completa su trabajo urgente y se bloquea de nuevo. El scheduler restaura a la <strong>Tarea D</strong> para que continúe su trabajo de baja prioridad. Así funciona la <strong>ejecución en ráfagas</strong> típica de RTOS.',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    if (taskA && taskA.state === 'RUNNING') {
                        taskA.setState('BLOCKED', 'Trabajo urgente completado, volviendo a esperar');
                        taskA.blockedOn = 'event_delay';
                        taskA.setInstruction('Esperando próximo evento...');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Reanudando interfaz de usuario...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('scheduler', `🔄 ${result.reason}`);
                }
            },

            // Paso 13: Tarea D completa — Tarea E (mínima prioridad)
            {
                title: '📝 Tarea de Fondo (Logger) Toma la CPU',
                description: 'La <strong>Tarea D</strong> finaliza. Ahora solo queda la <strong>Tarea E (Logger, prioridad 4)</strong> en estado READY. Las tareas de logging y mantenimiento suelen tener la prioridad más baja en un RTOS.',
                action: () => {
                    kernel.tick();
                    const taskD = kernel.getTaskById('task_d');
                    if (taskD && taskD.state === 'RUNNING') {
                        taskD.setState('BLOCKED', 'Interfaz actualizada, esperando cambios');
                        taskD.blockedOn = 'ui_idle';
                        taskD.setInstruction('Esperando interacción...');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Escribiendo logs del sistema...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('scheduler', `📝 ${result.reason}`);
                }
            },

            // Paso 14: Tarea E completa — Todas bloqueadas — IDLE
            {
                title: '😴 Todas las Tareas Bloqueadas — Entra IDLE',
                description: 'La <strong>Tarea E</strong> completa su logging y se bloquea. <strong>No hay tareas READY</strong>. El scheduler activa la <strong>tarea IDLE</strong>, una tarea especial de mínima prioridad que ejecuta cuando el sistema está ocioso. En FreeRTOS, esta tarea se llama <code>prvIdleTask</code>.',
                action: () => {
                    kernel.tick();
                    const taskE = kernel.getTaskById('task_e');
                    if (taskE && taskE.state === 'RUNNING') {
                        taskE.setState('BLOCKED', 'Logging completado, esperando nuevo ciclo');
                        taskE.blockedOn = 'periodic_log';
                        taskE.setInstruction('Esperando próximo ciclo de log...');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask && result.selectedTask.id === 'idle') {
                        result.selectedTask.setInstruction('Sistema ocioso. IDLE ejecutando...');
                    }
                    kernel.logEvent('system', `😴 ${result.reason}`);
                }
            },

            // Paso 15: Desbloqueo múltiple — Tareas vuelven a READY
            {
                title: '🌟 Reactivación de Tareas — El Sistema Despierta',
                description: 'Varias tareas se reactivan al cumplirse sus tiempos de espera. La <strong>Tarea A (prioridad 0)</strong> y la <strong>Tarea B (prioridad 1)</strong> pasan a READY. El scheduler inmediatamente selecciona a la <strong>Tarea A</strong> por tener la máxima prioridad.',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    const taskB = kernel.getTaskById('task_b');
                    if (taskA && taskA.state === 'BLOCKED') {
                        taskA.setState('READY', 'Timeout cumplido, reactivando');
                        taskA.blockedOn = null;
                        taskA.setInstruction('Lista para ejecutar.');
                    }
                    if (taskB && taskB.state === 'BLOCKED') {
                        taskB.setState('READY', 'Periodo cumplido, reactivando');
                        taskB.blockedOn = null;
                        taskB.setInstruction('Lista para ejecutar.');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Ejecutando tarea de máxima prioridad...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('system', `🌟 ${result.reason}`);
                }
            },

            // Paso 16: Simulación completada
            {
                title: '🏁 Ciclo Completo — Resumen del RTOS',
                description: 'La simulación ha demostrado los <strong>principios fundamentales</strong> de un RTOS: <br>✅ <strong>Scheduling por prioridad</strong> (0=máxima)<br>✅ <strong>Preempción</strong> cuando una tarea de mayor prioridad se desbloquea<br>✅ <strong>Semáforos</strong> para acceso exclusivo a recursos<br>✅ <strong>Colas de mensajes</strong> para comunicación entre tareas<br>✅ <strong>Cambio de contexto</strong> entre tareas<br>✅ <strong>Tarea IDLE</strong> cuando no hay trabajo pendiente<br><br>Estos conceptos son la base de sistemas como <strong>FreeRTOS, QNX, VxWorks</strong> y se estudian en los libros de <strong>Tanenbaum</strong> y <strong>Silberschatz</strong>.',
                action: () => {
                    kernel.tick();
                    kernel.logEvent('system', '🏁 Simulación completada. Todos los conceptos clave de RTOS demostrados.');
                    kernel.logEvent('system', '📚 Referencias: Tanenbaum "Sistemas Operativos Modernos", Silberschatz "Operating System Concepts", FreeRTOS Reference Manual, QNX Neutrino RTOS.');
                    this.completed = true;
                }
            }
        ];
    }

    /**
     * Crea las tareas de demostración
     */
    createTasks() {
        const tasks = [
            new Task('task_a', 'Tarea A - Control Motor', 0, 'Tarea crítica de control del motor. Máxima prioridad.'),
            new Task('task_b', 'Tarea B - Sensor', 1, 'Lectura de sensores. Alta prioridad. Se comunica por cola.'),
            new Task('task_c', 'Tarea C - Comunicación', 2, 'Procesamiento de datos de comunicación. Prioridad media.'),
            new Task('task_d', 'Tarea D - Interfaz', 3, 'Actualización de interfaz de usuario. Prioridad media-baja.'),
            new Task('task_e', 'Tarea E - Logger', 4, 'Registro de eventos del sistema. Mínima prioridad (tarea de fondo).')
        ];

        tasks.forEach(t => {
            t.createdAt = kernel.systemTick;
            t.lastStateChange = kernel.systemTick;
            kernel.tasks.push(t);
        });

        // Crear tarea IDLE
        const idleTask = new Task('idle', 'IDLE Task', 99, 'Tarea ociosa del sistema. Solo ejecuta cuando no hay trabajo.');
        idleTask.state = 'READY';
        kernel.tasks.push(idleTask);
        scheduler.setIdleTask(idleTask);
    }

    /**
     * Crea los recursos de sincronización (semáforos y colas)
     */
    createResources() {
        // Semáforos
        kernel.semaphores.push(new Semaphore('sem_i2c', 'I2C_Bus', 1, 1)); // Binario, disponible
        kernel.semaphores.push(new Semaphore('sem_uart', 'UART_Tx', 1, 1)); // Binario, disponible

        // Colas de mensajes
        kernel.messageQueues.push(new MessageQueue('q_sensor', 'SensorData', 3));
        kernel.messageQueues.push(new MessageQueue('q_ack', 'ACK_Channel', 2));
    }

    /**
     * Ejecuta el paso actual de la simulación
     * @returns {{ step: number, totalSteps: number, title: string, description: string, completed: boolean }|null}
     */
    executeNextStep() {
        if (this.currentStep + 1 >= this.steps.length) {
            this.completed = true;
            return null;
        }

        this.currentStep++;
        const step = this.steps[this.currentStep];

        // Ejecutar la acción del paso
        if (step.action) {
            step.action();
        }

        return {
            step: this.currentStep,
            totalSteps: this.steps.length,
            title: step.title,
            description: step.description,
            completed: this.currentStep >= this.steps.length - 1
        };
    }

    /**
     * Reinicia la simulación completamente
     */
    reset() {
        this.stopAutoPlay();
        this.currentStep = -1;
        this.started = false;
        this.completed = false;
        kernel.initialize();
        kernel.tasks = [];
        kernel.semaphores = [];
        kernel.messageQueues = [];
        kernel.runningTask = null;
        kernel.systemTick = 0;
        kernel.eventLog = [];
    }

    /**
     * Inicia el modo auto-play
     * @param {number} intervalMs - Milisegundos entre pasos
     * @param {function} callback - Función a llamar en cada paso
     */
    startAutoPlay(intervalMs, callback) {
        this.stopAutoPlay();
        this.autoPlayActive = true;
        this.autoPlayInterval = setInterval(() => {
            if (this.completed) {
                this.stopAutoPlay();
                return;
            }
            const result = this.executeNextStep();
            if (result && callback) {
                callback(result);
            }
            if (result && result.completed) {
                this.stopAutoPlay();
                if (callback) callback(result);
            }
        }, intervalMs);
    }

    /**
     * Detiene el auto-play
     */
    stopAutoPlay() {
        this.autoPlayActive = false;
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
    }

    /**
     * Retorna los datos para el informe descargable
     */
    getReportData() {
        return {
            steps: this.steps,
            totalSteps: this.steps.length,
            tasks: kernel.tasks.filter(t => t.id !== 'idle'),
            eventLog: kernel.eventLog,
            finalTick: kernel.systemTick
        };
    }
}

const simulation = new Simulation();