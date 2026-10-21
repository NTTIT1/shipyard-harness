import React, { useState, useRef, useEffect } from 'react';
import {
  FolderKanban, ChevronDown, Check, Menu as MenuIcon,
  Sparkles, Layers
} from 'lucide-react';
import IconButton from './ui/IconButton.jsx';

export default function TopHeader({
  projects = [],
  activeProjectId,
  onSelectProject,
  view,
  projectSubTab,
  onOpenDrawer,
}) {
  const [openDropdown, setOpenDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const currentProject = projects.find(p => p.id === activeProjectId)
    || (projects.length === 1 ? projects[0] : null);

  useEffect(() => {
    const handleOutsideClick = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(false);
      }
    };
    if (openDropdown) {
      document.addEventListener('pointerdown', handleOutsideClick);
    }
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [openDropdown]);

  // Map view to breadcrumb title
  const getViewTitle = () => {
    if (view === 'board') return 'Tổng quan điều hành';
    if (view === 'inbox' || view === 'review') return 'Việc của tôi';
    if (view === 'costs') return 'Báo cáo tổng hợp';
    if (view === 'users') return 'Quản lý người dùng';
    if (view === 'docs') return 'Tài liệu dự án';
    if (view === 'lanes') return 'Công việc (Lanes)';
    if (view === 'projects') {
      if (projectSubTab === 'gates') return 'Kiểm soát dự án (Gates)';
      if (projectSubTab === 'team') return 'Kỹ năng AI & Khung dự án';
      if (projectSubTab === 'runs') return 'Hành trình sản phẩm & Model';
      if (projectSubTab === 'memory') return 'Yêu cầu & Bộ nhớ';
      return 'Tổng quan dự án';
    }
    return 'Bảng điều khiển';
  };

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
            type="button"
            className="top-project-badge-btn"
            aria-expanded={openDropdown}
            aria-haspopup="listbox"
            onClick={() => setOpenDropdown(!openDropdown)}>
            <div className="top-project-badge-icon">
              <FolderKanban size={15} />
            </div>
            <div className="top-project-badge-text">
              <span className="top-project-sub-label">DỰ ÁN ĐANG LÀM VIỆC</span>
              <div className="top-project-main-row">
                <strong className="top-project-name">
                  {currentProject ? currentProject.name : 'Tất cả dự án'}
                </strong>
                {currentProject?.slug && (
                  <span className="top-project-slug">{currentProject.slug}</span>
                )}
                <ChevronDown size={14} className={`top-project-chevron${openDropdown ? ' open' : ''}`} />
              </div>
            </div>
          </button>

          {openDropdown && (
            <div className="top-project-dropdown" role="listbox">
              <div className="top-dropdown-header">Chọn dự án làm việc</div>
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
                  <span className="top-dd-desc">Xem toàn bộ lane và tài nguyên</span>
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
                      <span className="top-dd-desc">ID: {p.id}</span>
                    </div>
                    {isSelected && <Check size={14} className="top-dd-check" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top Header Right: Section Indicator / Context Breadcrumb */}
      <div className="top-header-right">
        <span className="top-header-section-name">
          {getViewTitle()}
        </span>
      </div>
    </header>
  );
}
