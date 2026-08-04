import React from 'react';
import { Bell, Mail, Sparkles, FileSpreadsheet } from 'lucide-react';
import { AppNotification, EmailSettings, GoogleSheetSettings } from '../types';
import mbSportsLogo from '../assets/images/mb_sports_official_logo_1784828804195.jpg';

interface HeaderProps {
  notifications: AppNotification[];
  emailSettings: EmailSettings;
  sheetSettings?: GoogleSheetSettings;
  onOpenEmailModal: () => void;
  onOpenSheetsModal: () => void;
  onOpenNotifications: () => void;
  unreadCount: number;
  isCloudSynced?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  notifications,
  emailSettings,
  sheetSettings,
  onOpenEmailModal,
  onOpenSheetsModal,
  onOpenNotifications,
  unreadCount,
  isCloudSynced = true,
}) => {
  return (
    <header className="bg-white border-b-4 border-zinc-900 text-zinc-900 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        {/* Brand & Prominent Logo */}
        <div className="flex items-center space-x-3 sm:space-x-5">
          {/* Bigger, High-Impact Logo Frame */}
          <div className="h-20 sm:h-28 md:h-32 w-56 sm:w-72 md:w-96 bg-white border-3 sm:border-4 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center p-2 sm:p-2.5 overflow-hidden flex-shrink-0 group transition-all">
            <img
              src={mbSportsLogo}
              alt="MB Sports Logo"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
            />
          </div>

          <div className="flex flex-col justify-center gap-1">
            <span className="inline-flex items-center px-3 py-1.5 font-black text-xs sm:text-sm uppercase tracking-wider bg-zinc-900 text-emerald-400 border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] w-max">
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              Gestão de Comissões & NFs
            </span>
            <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-emerald-100 border border-emerald-500 text-emerald-950 text-[10px] sm:text-xs font-black uppercase w-max">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
              </span>
              <span>Nuvem em Tempo Real (iPhone + iPad + PC)</span>
            </div>
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
            <span className={`w-2.5 h-2.5 rounded-full border border-zinc-900 flex-shrink-0 ${
              sheetSettings?.accessToken || sheetSettings?.webAppUrl ? 'bg-emerald-950' : 'bg-amber-300 animate-pulse'
            }`} title={sheetSettings?.accessToken ? "Conectado ao Google Sheets" : "Clique para conectar"} />
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
