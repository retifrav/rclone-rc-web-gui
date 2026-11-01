// modal dialog windows (it was just `alert()` before). These are native `<dialog>` elements
// opened with `showModal()`, which provides the behaviour (backdrop, inert page behind it,
// ESC, being on top of everything, focus restore), while the entire look comes from `dialogs.css`,
// so they look the same in different browsers
//
// every call builds a new dialog and removes it once it is closed, so several of them
// can be open at the same time (an error from the queue timer on top of a confirmation),
// each being above the previous one

export interface DialogButton
{
    label: string;
    // what `showDialog()` resolves with, if this button is the one that closes the dialog
    value: string;
    // "primary" and "danger" are filled with color, no style provided means plain button
    style?: "primary" | "danger";
    // the button to have the focus when the dialog opens, otherwise it is the default (last)
    // one, unless there is an element with `autofocus` in the body, which wins over both
    autofocus?: boolean;
    // custom logic of the button. Returning `false` keeps the dialog open (validation,
    // a request that is still in flight, a button that does something without closing
    // the dialog)
    onClick?: (dialog: HTMLDialogElement, button: HTMLButtonElement) => boolean;
}

export interface DialogOptions
{
    // a file in `./images/`
    icon: string;
    title: string;
    // a string becomes a paragraph, anything else (links, inputs, lists) is appended as it is
    body: (string | Node)[];
    // in the footer order, left to right, and the last one is the default one (pressed by Enter)
    buttons: DialogButton[];
}

const messageIcons: {[key: string]: string} = {
    "info": "info-circle-fill-blue.svg",
    "warning": "exclamation-triangle-fill-yellow.svg",
    "error": "exclamation-octagon-fill-red.svg"
}

// resolves with the `value` of the button that closed the dialog, or with an empty string
// when the dialog was dismissed (the close button, ESC or a click on the backdrop)
export function showDialog(options: DialogOptions) : Promise<string>
{
    return new Promise<string>(function(resolve)
    {
        const dialog: HTMLDialogElement = Object.assign(
            document.createElement("dialog"),
            {
                className: "dialog"
            }
        );
        dialog.setAttribute("aria-label", options.title);

        // the form is what makes Enter in an input field press the default button, and with
        // the `dialog` method a submission that is not prevented can only close the dialog,
        // never navigate the page
        const form: HTMLFormElement = Object.assign(
            document.createElement("form"),
            {
                method: "dialog"
            }
        );

        // --- header

        const header: HTMLDivElement = Object.assign(
            document.createElement("div"),
            {
                className: "dialog-header"
            }
        );
        header.appendChild(
            Object.assign(
                document.createElement("img"),
                {
                    src: "./images/".concat(options.icon),
                    alt: ""
                }
            )
        );
        const title: HTMLHeadingElement = document.createElement("h3");
        title.appendChild(document.createTextNode(options.title));
        header.appendChild(title);

        const closeButton: HTMLButtonElement = Object.assign(
            document.createElement("button"),
            {
                type: "button",
                className: "dialog-close",
                title: "Close"
            }
        );
        closeButton.setAttribute("aria-label", "Close");
        closeButton.appendChild(
            Object.assign(
                document.createElement("img"),
                {
                    src: "./images/x-lg.svg",
                    alt: ""
                }
            )
        );
        closeButton.addEventListener(
            "click",
            function() { dialog.close(""); }
        );
        header.appendChild(closeButton);

        form.appendChild(header);

        // --- body

        const body: HTMLDivElement = Object.assign(
            document.createElement("div"),
            {
                className: "dialog-body"
            }
        );
        for (let i = 0; i < options.body.length; i++)
        {
            const item: string | Node = options.body[i];
            if (typeof item === "string")
            {
                const p: HTMLParagraphElement = document.createElement("p");
                p.appendChild(document.createTextNode(item));
                body.appendChild(p);
            }
            else
            {
                body.appendChild(item);
            }
        }
        // the inline error line, see `setDialogError()`
        const error: HTMLParagraphElement = Object.assign(
            document.createElement("p"),
            {
                className: "dialog-error"
            }
        );
        error.setAttribute("role", "alert");
        error.style.display = "none";
        body.appendChild(error);

        form.appendChild(body);

        // --- footer

        const footer: HTMLDivElement = Object.assign(
            document.createElement("div"),
            {
                className: "dialog-footer"
            }
        );
        let defaultButton: HTMLButtonElement | null = null;
        let focusButton: HTMLButtonElement | null = null;
        for (let b = 0; b < options.buttons.length; b++)
        {
            const buttonOptions: DialogButton = options.buttons[b];
            // only the default button is a submit one, as Enter in an input field
            // presses the first submit button of the form, and that would be Cancel,
            // which comes first
            const isDefault: boolean = b === options.buttons.length - 1;

            const button: HTMLButtonElement = Object.assign(
                document.createElement("button"),
                {
                    type: isDefault ? "submit" : "button",
                    className: "dialog-button",
                    value: buttonOptions.value
                }
            );
            if (buttonOptions.style !== undefined) { button.classList.add(buttonOptions.style); }
            button.appendChild(document.createTextNode(buttonOptions.label));

            if (isDefault)
            {
                // the default button is handled by the `submit` listener below
                defaultButton = button;
            }
            else
            {
                button.addEventListener(
                    "click",
                    function() { buttonPressed(dialog, button, buttonOptions); }
                );
            }

            if (buttonOptions.autofocus === true || (isDefault && focusButton === null))
            {
                focusButton = button;
            }

            footer.appendChild(button);
        }

        form.appendChild(footer);

        // both a click on the default button and Enter in an input field end up here
        form.addEventListener(
            "submit",
            function(e)
            {
                e.preventDefault();
                if (defaultButton === null) { return; }
                buttonPressed(dialog, defaultButton, options.buttons[options.buttons.length - 1]);
            }
        );

        dialog.appendChild(form);

        // --- behaviour

        // the dialog has no padding and the form covers all of it, so a click whose target
        // is the dialog element itself is a click on its backdrop. The press has to be there too,
        // because selecting text in an input field and releasing the mouse button outside
        // of the dialog dispatches the click to the common ancestor of the two, which is the dialog
        let pressedOnBackdrop: boolean = false;
        dialog.addEventListener(
            "pointerdown",
            function(e) { pressedOnBackdrop = e.target === dialog; }
        );
        dialog.addEventListener(
            "click",
            function(e)
            {
                if (pressedOnBackdrop && e.target === dialog) { dialog.close(""); }
            }
        );

        // ESC is handled by the browser, it closes the dialog without changing its `returnValue`,
        // which is an empty string until something closes the dialog with a value
        dialog.addEventListener(
            "close",
            function()
            {
                dialog.remove();
                resolve(dialog.returnValue);
            }
        );

        // `showModal()` would otherwise focus the first focusable element,
        // which is the close button
        if (focusButton !== null) { focusButton.autofocus = true; }

        document.body.appendChild(dialog);
        dialog.showModal();
        // `showModal()` itself is supposed to focus the first element with `autofocus`,
        // which is the one from the body if there is any, but it is focused explicitly
        // to not depend on that
        const autofocusElement: HTMLElement | null = dialog.querySelector("[autofocus]");
        if (autofocusElement !== null) { autofocusElement.focus(); }
    });
}

function buttonPressed(dialog: HTMLDialogElement, button: HTMLButtonElement, buttonOptions: DialogButton)
{
    if (buttonOptions.onClick !== undefined && buttonOptions.onClick(dialog, button) === false) { return; }

    dialog.close(buttonOptions.value);
}

// shows a message in the dialog's own error line, above the buttons, and an empty message hides it
export function setDialogError(dialog: HTMLDialogElement, message: string)
{
    const error: HTMLParagraphElement = dialog.querySelector(".dialog-error") as HTMLParagraphElement;
    error.textContent = message;
    error.style.display = message === "" ? "none" : "block";
}

// the replacement for `alert()`
export function showMessage(
    kind: "info" | "warning" | "error",
    title: string,
    body: (string | Node)[]
) : Promise<string>
{
    return showDialog(
        {
            icon: messageIcons[kind],
            title: title,
            body: body,
            buttons: [
                { label: "OK", value: "ok", style: "primary" }
            ]
        }
    );
}

// a question about a destructive action, so the confirming button is a red one,
// and it is Cancel that has the focus, so pressing Enter or Space right away
// does not confirm anything
export function showConfirmation(
    icon: string,
    title: string,
    body: (string | Node)[],
    confirmLabel: string
) : Promise<boolean>
{
    return showDialog(
        {
            icon: icon,
            title: title,
            body: body,
            buttons: [
                { label: "Cancel", value: "", autofocus: true },
                { label: confirmLabel, value: "confirm", style: "danger" }
            ]
        }
    ).then(
        function(value: string) { return value === "confirm"; }
    );
}
