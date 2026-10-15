package com.shipyard.platform.project.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class CreateProjectRequest {
    @NotBlank(message = "Slug is required")
    @Pattern(regexp = "^[a-z0-9_-]+$", message = "Slug must contain only lowercase alphanumeric, dashes, or underscores")
    private String slug;

    @NotBlank(message = "Name is required")
    private String name;

    @NotBlank(message = "Repository URL is required")
    private String repoUrl;

    private String defaultBranch = "development";
    private String figmaFileKey;

    public CreateProjectRequest() {}

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getRepoUrl() { return repoUrl; }
    public void setRepoUrl(String repoUrl) { this.repoUrl = repoUrl; }

    public String getDefaultBranch() { return defaultBranch; }
    public void setDefaultBranch(String defaultBranch) { this.defaultBranch = defaultBranch; }

    public String getFigmaFileKey() { return figmaFileKey; }
    public void setFigmaFileKey(String figmaFileKey) { this.figmaFileKey = figmaFileKey; }
}
