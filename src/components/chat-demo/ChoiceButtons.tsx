type ChoiceItem = {
  id: string;
  label: string;
};

type ChoiceButtonsProps = {
  choices: ChoiceItem[];
  onSelect: (choice: ChoiceItem) => void;
  disabled?: boolean;
};

export default function ChoiceButtons({
  choices,
  onSelect,
  disabled = false,
}: ChoiceButtonsProps) {
  return (
    <div
      className="animate-in"
      style={{
        display: "flex",
        gap: "2rem",
        justifyContent: "center",
        marginTop: "1.5rem",
        flexWrap: "wrap",
      }}
    >
      {choices.map((choice) => (
        <button
          key={choice.id}
          className={`btn-choice ${choice.label.toLowerCase() === "yes" ? "choice-yes" : "choice-no"}`}
          onClick={() => onSelect(choice)}
          disabled={disabled}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
