import React from 'react';
import { X, Bell, AlertTriangle, CheckCircle2, Info, Calendar, Sparkles } from 'lucide-react';
import { AppNotification } from '../types';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAllAsRead: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:justify-end p-2 sm:p-4 bg-zinc-900/80 backdrop-blur-xs">
      <div className="bg-white max-w-sm w-full border-3 sm:border-4 border-zinc-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden h-[88vh] flex flex-col">
        {/* Header */}
        <div className="p-4 bg-zinc-900 text-white flex items-center justify-between border-b-4 border-zinc-900">
          <div className="flex items-center space-x-2">
            <Bell className="w-5 h-5 text-amber-400" />
            <h3 className="font-black uppercase tracking-tight text-sm">Central de Notificações</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 border-2 border-white hover:bg-zinc-800 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subheader */}
        <div className="px-4 py-2.5 bg-zinc-100 border-b-2 border-zinc-900 flex items-center justify-between text-xs font-bold text-zinc-900 uppercase">
          <span>{notifications.filter(n => !n.lida).length} NÃO LIDA(S)</span>
          <button
            onClick={onMarkAllAsRead}
            className="text-zinc-900 font-black underline hover:bg-zinc-200 px-1 py-0.5"
          >
            Marcar todas lidas
          </button>
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 font-bold uppercase tracking-wider text-xs">
              Nenhuma notificação no momento.
            </div>
          ) : (
            notifications.map(notif => (
              <div
                key={notif.id}
                className={`p-3.5 border-2 border-zinc-900 transition ${
                  !notif.lida ? 'bg-amber-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'bg-white'
                }`}
              >
                <div className="flex items-start space-x-2.5">
                  <div className="mt-0.5 flex-shrink-0">
                    {notif.tipo === 'vencimento' || notif.tipo === 'alerta' ? (
                      <AlertTriangle className="w-4 h-4 text-zinc-950" />
                    ) : notif.tipo === 'sucesso' ? (
                      <CheckCircle2 className="w-4 h-4 text-zinc-950" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-zinc-950" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase text-zinc-900">{notif.titulo}</h4>
                      <span className="text-[10px] font-mono font-bold text-zinc-500">{notif.data}</span>
                    </div>
                    <p className="text-xs font-semibold text-zinc-800 mt-1 leading-relaxed">{notif.mensagem}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
