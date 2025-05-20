import { EditableCell } from './EditableCell';
import { ReadOnlyCell } from './ReadOnlyCell';
import { StatusBadge, type Status as StatusType } from '@/components/ui/StatusBadge';
import { IconHeader } from '@/components/ui/IconHeader';
import { Hourglass } from 'lucide-react';
import React, { useState, useCallback } from 'react';

const ContactTable = () => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setIsDraggingOver(false);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDraggingOver) {
      setIsDraggingOver(true);
    }
  }, [isDraggingOver]);

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      console.log('Fichier déposé:', file.name);

      const acceptedTypes = [
        'text/csv', 
        'application/vnd.ms-excel', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];

      if (acceptedTypes.includes(file.type)) {
        console.log('Type de fichier correct:', file.type);
      } else {
        console.warn('Type de fichier non supporté:', file.type);
        alert(`Type de fichier non supporté: ${file.name}. Veuillez utiliser un fichier Excel (xls, xlsx) ou CSV.`);
      }
    }
  }, []);

  return (
    <div
      className={`relative p-4 border-2 border-dashed rounded-lg transition-all duration-300 ease-in-out ${
        isDraggingOver ? 'border-blue-500 bg-blue-50 dark:bg-slate-700' : 'border-gray-300 dark:border-gray-600'
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-blue-500 bg-opacity-75 rounded-lg pointer-events-none">
          <Hourglass size={60} className="text-white animate-spin mb-4" />
          <p className="text-white text-xl font-semibold">Déposer le fichier ici</p>
        </div>
      )}
      {!isDraggingOver && (
         <div className="text-center text-gray-500 dark:text-gray-400 py-8">
           <p>Glissez et déposez un fichier Excel (.xlsx, .xls) ou CSV (.csv) ici</p>
           <p className="text-sm">ou cliquez pour sélectionner un fichier (fonctionnalité à venir)</p>
         </div>
      )}
    </div>
  );
};

export default ContactTable;
