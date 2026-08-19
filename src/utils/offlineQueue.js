export const getOfflineQueue = () => {
    try {
        return JSON.parse(localStorage.getItem('safenet_offline_queue')) || [];
    } catch {
        return [];
    }
};

export const saveToOfflineQueue = (report) => {
    const queue = getOfflineQueue();
    queue.push(report);
    localStorage.setItem('safenet_offline_queue', JSON.stringify(queue));
};

export const clearOfflineQueue = () => {
    localStorage.removeItem('safenet_offline_queue');
};

export const flushOfflineQueue = async (syncCallback) => {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;
    
    // Simulate syncing
    for (const report of queue) {
        await syncCallback(report);
    }
    clearOfflineQueue();
};
