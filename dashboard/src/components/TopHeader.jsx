import React, { useState, useRef, useEffect } from 'react';
import {
  FolderKanban, ChevronDown, Check, Menu as MenuIcon,
  Layers
} from 'lucide-react';
import IconButton from './ui/IconButton.jsx';

export default function TopHeader({
  projects = [],
  activeProjectId,
  onSelectProject,
  onOpenDrawer,
}) {
  const [openDropdown, setOpenDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);

  const currentProject = projects.find(p => p.id === activeProjectId)
    || (projects.length === 1 ? projects[0] : null);

  useEffect(() => {
    const handleOutsideClick = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(false);
      }
    };
    const handleKey = e => {
      if (e.key === 'Escape') { setOpenDropdown(false); triggerRef.current?.focus(); }
    };
    if (openDropdown) {
      document.addEventListener('pointerdown', handleOutsideClick);
      document.addEventListener('keydown', handleKey);
      // Focus the current choice so arrow/tab navigation starts where the user is.
      requestAnimationFrame(() => dropdownRef.current?.querySelector('[aria-selected="true"]')?.focus());
    }
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openDropdown]);

  return (
    <header className="app-top-header" role="banner">
      <div className="top-header-left">
        <IconButton
          className="top-header-menu-btn"
          icon={MenuIcon}
          label="Mở menu"
          onClick={onOpenDrawer}
        />

        {/* Project Selector Badge / Dropdown */}
        <div className="top-project-badge-wrap" ref={dropdownRef}>
          <button
            ref={triggerRef}
            type="button"
            className="top-project-badge-btn"
            aria-expanded={openDropdown}
            aria-haspopup="listbox"
            aria-label={`Dự án đang xem: ${currentProject ? currentProject.name : 'tất cả dự án'}. Đổi dự án`}
            onClick={() => setOpenDropdown(!openDropdown)}>
            <FolderKanban size={15} className="top-project-icon" aria-hidden="true" />
            <strong className="top-project-name">{currentProject ? currentProject.name : 'Tất cả dự án'}</strong>
            {currentProject?.slug && <span className="top-project-slug">{currentProject.slug}</span>}
            <ChevronDown size={14} className={`top-project-chevron${openDropdown ? ' open' : ''}`} aria-hidden="true" />
          </button>

          {openDropdown && (
            <div className="top-project-dropdown" role="listbox">
              <div className="top-dropdown-header">Xem dự án</div>
              <button
                type="button"
                role="option"
                aria-selected={!activeProjectId || activeProjectId === 'ALL'}
                className={`top-dropdown-item${(!activeProjectId || activeProjectId === 'ALL') ? ' active' : ''}`}
                onClick={() => {
                  onSelectProject?.('ALL');
                  setOpenDropdown(false);
                }}>
                <div className="top-dd-icon">
                  <Layers size={14} />
                </div>
                <div className="top-dd-info">
                  <span className="top-dd-name">Tất cả dự án</span>
                  <span className="top-dd-desc">Mọi lane và chi phí, gom theo dự án</span>
                </div>
                {(!activeProjectId || activeProjectId === 'ALL') && (
                  <Check size={14} className="top-dd-check" />
                )}
              </button>

              <div className="top-dropdown-divider" />

              {projects.map(p => {
                const isSelected = p.id === activeProjectId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`top-dropdown-item${isSelected ? ' active' : ''}`}
                    onClick={() => {
                      onSelectProject?.(p.id);
                      setOpenDropdown(false);
                    }}>
                    <div className="top-dd-icon accent">
                      <FolderKanban size={14} />
                    </div>
                    <div className="top-dd-info">
                      <div className="top-dd-title-row">
                        <span className="top-dd-name">{p.name}</span>
                        <span className="top-dd-slug">{p.slug}</span>
                      </div>
                      {p.repoUrl && <span className="top-dd-desc">{p.repoUrl.replace(/^https?:\/\//, '')}</span>}
                    </div>
                    {isSelected && <Check size={14} className="top-dd-check" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </header>
  );
}
