import React from 'react';
import { Bell, Mail, Sparkles, FileSpreadsheet } from 'lucide-react';
import { AppNotification, EmailSettings } from '../types';
import mbSportsLogo from '../assets/images/mb_sports_official_logo_1784828804195.jpg';

interface HeaderProps {
  notifications: AppNotification[];
  emailSettings: EmailSettings;
  onOpenEmailModal: () => void;
  onOpenSheetsModal: () => void;
  onOpenNotifications: () => void;
  unreadCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  notifications,
  emailSettings,
  onOpenEmailModal,
  onOpenSheetsModal,
  onOpenNotifications,
  unreadCount,
}) => {
  return (
    <header className="bg-white border-b-4 border-zinc-900 text-zinc-900 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Brand & Logo */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Prominent Logo */}
          <div className="h-16 sm:h-20 w-48 sm:w-64 md:w-72 bg-white border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center p-1.5 overflow-hidden flex-shrink-0 group transition-all">
            <img
              src={mbSportsLogo}
              alt="MB Sports Logo"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
            />
          </div>

          <div className="flex flex-col justify-center">
            <span className="inline-flex items-center px-2.5 py-1 font-black text-[10px] sm:text-xs uppercase tracking-wider bg-zinc-900 text-emerald-400 border border-zinc-900 w-max">
              <Sparkles className="w-3 h-3 mr-1" />
              Gestão de Comissões
            </span>
          </div>
        </div>

        {/* Action Controls - Optimised for touch & mobile */}
        <div className="flex items-center justify-end space-x-2 sm:space-x-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-200">
          {/* Google Sheets Modal Button */}
          <button
            onClick={onOpenSheetsModal}
            className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3 py-2.5 sm:py-2 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 border-2 border-zinc-900 text-zinc-950 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[44px] sm:min-h-0"
            title="Sincronizar Google Sheets"
          >
            <FileSpreadsheet className="w-4 h-4 text-zinc-950 flex-shrink-0" />
            <span className="inline text-[11px] sm:text-xs">Sheets</span>
          </button>

          {/* E-mail configuration status button */}
          <button
            onClick={onOpenEmailModal}
            className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3 py-2.5 sm:py-2 bg-white hover:bg-zinc-100 active:bg-zinc-200 border-2 border-zinc-900 text-zinc-900 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[44px] sm:min-h-0"
            title="Configurações de E-mail"
          >
            <Mail className="w-4 h-4 text-zinc-900 flex-shrink-0" />
            <span className="hidden md:inline max-w-[120px] truncate">{emailSettings.userEmail}</span>
            <span className="inline md:hidden text-[11px]">E-mail</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-zinc-900 flex-shrink-0"></span>
          </button>

          {/* Notifications button */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2.5 sm:p-2 bg-zinc-900 hover:bg-zinc-800 text-white border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            title="Central de Notificações"
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-400 text-zinc-900 font-black text-[10px] flex items-center justify-center border-2 border-zinc-900 animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
