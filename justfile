set shell := ["bash", "-uc"]

output := "public"

# build tailwind css
tailwind:
    npx @tailwindcss/cli -i input.css -o static/site.css --minify

# watch tailwind css
tailwind-watch:
    npx @tailwindcss/cli -i input.css -o static/site.css --watch

# build css (alias)
css: tailwind

# copy spec.md into the site as /spec/ (without its h1, which the template renders)
spec:
    { printf '+++\ntitle = "Specification"\ndescription = "The Cassis Order Protocol v1.0 draft: connection URIs, transport, sessions and the invoice messages."\ntemplate = "spec.html"\n+++\n\n'; tail -n +2 spec.md; } > content/spec.md

# run local dev server (autoreload + css watch)
dev: spec tailwind
    npx @tailwindcss/cli -i input.css -o static/site.css --watch & zola serve

# build production site
build: spec tailwind
    zola build

# clean build output
clean:
    rm -rf {{output}} content/spec.md

# build and preview prod locally
preview: spec tailwind
    zola build && zola serve
