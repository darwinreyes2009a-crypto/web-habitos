export function registerRecordActions(app) {
  const { S, save, rememberPendingDeletes } = app.state;
  const { go, giftsOf } = app.domain;
  const { confirmDialog, toast } = app.components;
  const render = app.render;

  function deleteTask(id) {
    const task = S.tasks.find(item => item.id === id);
    if (!task) return;
    confirmDialog({
      title: '¿Eliminar "' + task.title + '"?',
      message: 'Se eliminará esta tarea y su historial de días completados. Podrás deshacerlo unos segundos desde el aviso.',
      confirmText: 'Eliminar',
      onConfirm: () => {
        const index = S.tasks.findIndex(item => item.id === id);
        if (index < 0) return;
        const [removed] = S.tasks.splice(index, 1);
        save();
        toast('Tarea eliminada', { label: 'Deshacer', fn: () => { S.tasks.splice(Math.min(index, S.tasks.length), 0, removed); save(); render(); } });
        go('tasks', undefined, { replace: true });
      }
    });
  }

  function deleteGift(id) {
    const gift = S.gifts.find(item => item.id === id);
    if (!gift) return;
    confirmDialog({
      title: '¿Eliminar "' + gift.title + '"?',
      message: 'Se eliminará este regalo o idea. Podrás deshacerlo unos segundos desde el aviso.',
      confirmText: 'Eliminar',
      onConfirm: () => {
        const index = S.gifts.findIndex(item => item.id === id);
        if (index < 0) return;
        const [removed] = S.gifts.splice(index, 1);
        save();
        toast('Regalo eliminado', { label: 'Deshacer', fn: () => { S.gifts.splice(Math.min(index, S.gifts.length), 0, removed); save(); render(); } });
        go('gifts', undefined, { replace: true });
      }
    });
  }

  function deletePerson(person) {
    confirmDialog({
      title: '¿Eliminar a ' + person.name + '?',
      message: 'Sus ' + giftsOf(person.id).length + ' regalos quedarán sin asignar (no se borran).',
      confirmText: 'Eliminar',
      onConfirm: () => {
        // `S.people` se sustituye por un array nuevo; registramos el id
        // explícitamente para que la sincronización no lo resucite.
        rememberPendingDeletes('people', [person.id]);
        for (const gift of S.gifts) if (gift.personId === person.id) gift.personId = null;
        S.people = S.people.filter(item => item.id !== person.id);
        save();
        toast('Persona eliminada');
        go('gifts', undefined, { replace: true });
      }
    });
  }

  Object.assign(app.actions, { deleteTask, deleteGift, deletePerson });
}
