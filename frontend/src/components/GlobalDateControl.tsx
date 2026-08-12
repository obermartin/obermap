import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { useTranslation } from '../contexts/I18nContext';
import clsx from 'clsx';

interface GlobalDateControlProps {
  mode: 'single' | 'range';
  onModeChange: (mode: 'single' | 'range') => void;
  startDate: string;
  onStartDateChange: (date: string) => void;
  endDate: string;
  onEndDateChange: (date: string) => void;
}

const formatDateString = (dateStr: string, t: (key: string) => string) => {
  if (dateStr === 'today') return t('Today').toUpperCase();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}.${month}.${year}`;
  }
  return dateStr;
};

const resolveDate = (dateStr: string) => {
  if (dateStr === 'today') return new Date();
  return new Date(dateStr);
};

const incrementDate = (dateStr: string, days: number): string => {
  const date = resolveDate(dateStr);
  date.setDate(date.getDate() + days);
  
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
};

const DateField: React.FC<{
  value: string;
  onChange: (val: string) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation();
  
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (newDate: string) => {
    // We must use local time for the today comparison, because <input type="date">
    // values are in local YYYY-MM-DD.
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (newDate === todayStr) {
      onChange('today');
    } else {
      onChange(newDate);
    }
  };

  const handleUp = () => handleChange(incrementDate(value, 1));
  const handleDown = () => handleChange(incrementDate(value, -1));

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const localTodayStr = `${yyyy}-${mm}-${dd}`;

  // Automatically convert a hardcoded date string that matches today's local date into the 'today' keyword
  // This handles cases where the state is stuck on 'YYYY-MM-DD' and the native date picker won't fire onChange 
  // because clicking 'Today' doesn't actually change the input's value.
  useEffect(() => {
    if (value === localTodayStr) {
      onChange('today');
    }
  }, [value, localTodayStr, onChange]);

  const inputValue = value === 'today' ? localTodayStr : value;

  return (
    <div className="relative flex flex-col items-center justify-center min-w-[100px] h-10 px-2 shrink-0">
      <button onClick={handleUp} className="absolute top-0 text-white/60 hover:text-white pb-1 w-full flex justify-center h-[14px] items-center group z-10">
        <ChevronUp size={14} strokeWidth={3} className="group-hover:-translate-y-0.5 transition-transform" />
      </button>
      
      <div className="relative w-full flex-1 flex items-center justify-center pt-0 z-0 font-bold text-sm tracking-wide select-none cursor-pointer" onClick={() => (inputRef.current as any)?.showPicker?.()}>
        {formatDateString(value, t)}
        
        <input
          ref={inputRef}
          type="date"
          value={inputValue}
          onChange={(e) => {
            if (e.target.value) {
              handleChange(e.target.value);
            }
          }}
          className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
        />
      </div>

      <button onClick={handleDown} className="absolute bottom-0 text-white/60 hover:text-white pt-1 w-full flex justify-center h-[14px] items-center group z-10">
        <ChevronDown size={14} strokeWidth={3} className="group-hover:translate-y-0.5 transition-transform" />
      </button>
    </div>
  );
};

export const GlobalDateControl: React.FC<GlobalDateControlProps> = ({
  mode,
  onModeChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange
}) => {
  const isRange = mode === 'range';

  const toggleMode = () => {
    if (isRange) {
      onModeChange('single');
    } else {
      onModeChange('range');
    }
  };

  return (
    <div className="flex bg-black items-center h-12 text-white max-w-full shrink-0 shadow-lg rounded-full overflow-hidden p-1 gap-1 pointer-events-auto ui-glass-panel">
      <DateField value={startDate} onChange={onStartDateChange} />

      <motion.div
        initial={false}
        animate={{
          width: isRange ? 50 : 0,
          opacity: isRange ? 1 : 0
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="overflow-hidden flex items-center justify-center shrink-0 h-full"
      >
        <div className="w-[30px] h-[2px] bg-white shrink-0" />
      </motion.div>

      <AnimatePresence>
        {isRange && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden shrink-0 flex items-center"
          >
            <DateField value={endDate} onChange={onEndDateChange} />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={toggleMode}
        className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors shrink-0 z-10 ml-1"
      >
        <Plus 
          size={20} 
          strokeWidth={2} 
          className={clsx("transition-transform duration-300", isRange && "rotate-45")} 
        />
      </button>
    </div>
  );
};
